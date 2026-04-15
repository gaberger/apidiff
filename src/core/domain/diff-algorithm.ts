// Pure diff algorithm — zero external imports, domain only
// Implements the change detection algorithm from ARCHITECTURE.md

import type { DiffResult, FlatMap } from "./types.js";
import { flatten, leafName, describeType } from "./flatten.js";
import { matchScore, FUZZY_THRESHOLD } from "./levenshtein.js";

function parentPath(path: string): string {
  const idx = path.lastIndexOf(".");
  return idx > 0 ? path.slice(0, idx) : "";
}

function sharedAncestorDepth(a: string, b: string): number {
  const partsA = a.split(".");
  const partsB = b.split(".");
  let shared = 0;
  for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
    if (partsA[i] === partsB[i]) shared++;
    else break;
  }
  return shared;
}

function isRelated(a: string, b: string): boolean {
  const partsA = a.split(".");
  const partsB = b.split(".");
  const depth = Math.max(partsA.length, partsB.length);
  const shared = sharedAncestorDepth(a, b);

  // OpenAPI endpoint boundary: if both paths are under "paths.",
  // they must share the same endpoint (paths.<route>.<method>).
  if (partsA[0] === "paths" && partsB[0] === "paths") {
    if (partsA.length >= 3 && partsB.length >= 3) {
      if (partsA[1] !== partsB[1] || partsA[2] !== partsB[2]) {
        return false;
      }
    }
  }

  // Schema boundary: if both are under "components.schemas.",
  // they must share the same schema name.
  if (partsA[0] === "components" && partsA[1] === "schemas" &&
      partsB[0] === "components" && partsB[1] === "schemas") {
    if (partsA.length >= 3 && partsB.length >= 3 && partsA[2] !== partsB[2]) {
      return false;
    }
  }

  const required = depth <= 3 ? 1 : depth <= 6 ? 2 : Math.max(3, Math.ceil(depth * 0.4));
  return shared >= required;
}

// Upper bound on fb size before fuzzy-rename fallback is skipped. Fuzzy matching
// is O(removes × bKeys × pathLen²) due to Levenshtein; on Twilio-scale specs
// it freezes the UI. Exact rename/move detection still runs for any size.
const FUZZY_SIZE_LIMIT = 5000;

/**
 * Pass 1 — fast, exact-path-only diff. Produces added / removed / changed /
 * type-change / unchanged entries by simple key-membership and value compare.
 * Skips ALL fuzzy matching so it can return on multi-MB specs in <1s.
 *
 * The worker streams these as a "partial-results" message so the UI can paint
 * a usable diff immediately, then pass 2 (enrichDiffWithRenames) replaces
 * matched added/removed pairs with renamed/moved entries.
 */
export function computeStructuralDiff(fa: FlatMap, fb: FlatMap): DiffResult[] {
  const results: DiffResult[] = [];
  const aKeys = Object.keys(fa);
  const bKeys = Object.keys(fb);
  const allKeys = new Set([...aKeys, ...bKeys]);

  for (const key of allKeys) {
    const inA = key in fa;
    const inB = key in fb;

    if (inA && inB) {
      const oldVal = fa[key];
      const newVal = fb[key];
      if (serialize(oldVal) === serialize(newVal)) {
        results.push({ type: "unchanged", path: key, old: oldVal, new: newVal });
      } else if (describeType(oldVal) !== describeType(newVal)) {
        results.push({
          type: "type-change",
          path: key,
          old: oldVal,
          new: newVal,
          oldType: describeType(oldVal),
          newType: describeType(newVal),
        });
      } else {
        results.push({ type: "changed", path: key, old: oldVal, new: newVal });
      }
    } else if (inA && !inB) {
      results.push({ type: "removed", path: key, old: fa[key] });
    } else {
      results.push({ type: "added", path: key, new: fb[key] });
    }
  }

  return results;
}

/**
 * Pass 2 — walk a structural diff and convert matched `removed` + `added`
 * pairs into `renamed` or `moved` entries. Returns a NEW results array
 * (preserves input order). The slow Levenshtein-based fuzzy matching
 * lives entirely in this function so pass 1 can run unblocked.
 *
 * After this pass, the result set contains the same set of (path, value)
 * facts as `computeDiff(a, b)` returns — they're equivalent superset/subset.
 */
export function enrichDiffWithRenames(
  structural: DiffResult[],
  fa: FlatMap,
  fb: FlatMap,
): DiffResult[] {
  const aKeys = Object.keys(fa);
  const bKeys = Object.keys(fb);
  const fuzzyEnabled = bKeys.length <= FUZZY_SIZE_LIMIT && aKeys.length <= FUZZY_SIZE_LIMIT;

  // Build the fb-only indexes (paths that exist in fb but not fa) keyed
  // by serialized value and by (leaf+value). These are the candidate pools
  // for matching removed entries to additions.
  const fbOnlyByValue = new Map<string, string[]>();
  const fbOnlyByLeafValue = new Map<string, string[]>();
  for (const fbKey of bKeys) {
    if (fbKey in fa) continue;
    const ser = serialize(fb[fbKey]);
    const leaf = leafName(fbKey);

    let byVal = fbOnlyByValue.get(ser);
    if (!byVal) { byVal = []; fbOnlyByValue.set(ser, byVal); }
    byVal.push(fbKey);

    const leafKey = leaf + "\0" + ser;
    let byLeaf = fbOnlyByLeafValue.get(leafKey);
    if (!byLeaf) { byLeaf = []; fbOnlyByLeafValue.set(leafKey, byLeaf); }
    byLeaf.push(fbKey);
  }

  // Track which `added` entries (i.e. fb-only keys) have been consumed by
  // a rename/move match so we can drop the corresponding "added" entries
  // from the structural results when re-emitting.
  const consumedAdditions = new Set<string>();
  const enriched: DiffResult[] = [];

  // Two-pass over structural: first emit unchanged/changed/type-change as-is,
  // and rewrite removed → renamed/moved when a match is found. We defer
  // emission of added entries until we know which ones got consumed.
  for (const entry of structural) {
    if (entry.type === "added") continue;            // re-emitted at the end
    if (entry.type !== "removed") {                  // unchanged / changed / type-change
      enriched.push(entry);
      continue;
    }

    // Removed entry — try to match it to an unconsumed addition.
    const key = entry.path;
    const oldVal = fa[key];
    const ser = serialize(oldVal);
    const leaf = leafName(key);

    // Rename match: exact value, different leaf name, same parent or related.
    let renamedTo: string | null = null;
    let fuzzyConfidence: number | null = null;
    const renamePool = fbOnlyByValue.get(ser);
    if (renamePool) {
      const keyParent = parentPath(key);
      for (const fbKey of renamePool) {
        if (consumedAdditions.has(fbKey)) continue;
        if (leafName(fbKey) === leaf) continue;
        if (parentPath(fbKey) === keyParent) { renamedTo = fbKey; break; }
        if (isRelated(key, fbKey)) { renamedTo = fbKey; break; }
      }
    }

    // Fuzzy rename fallback (small specs only — Levenshtein is the slow part).
    if (!renamedTo && fuzzyEnabled) {
      let bestScore = -1;
      let bestKey: string | null = null;
      for (const fbKey of bKeys) {
        if (fbKey in fa || consumedAdditions.has(fbKey)) continue;
        if (leafName(fbKey) === leaf) continue;
        if (!isRelated(key, fbKey)) continue;
        const score = matchScore(key, fbKey, fa[key], fb[fbKey]);
        if (score >= FUZZY_THRESHOLD && score > bestScore) {
          bestScore = score;
          bestKey = fbKey;
        }
      }
      if (bestKey !== null) {
        renamedTo = bestKey;
        fuzzyConfidence = Math.round(bestScore * 100) / 100;
      }
    }

    if (renamedTo) {
      const shared = sharedAncestorDepth(key, renamedTo);
      const maxDepth = Math.max(key.split(".").length, renamedTo.split(".").length);
      const confidence = maxDepth > 0 ? shared / maxDepth : 1;
      const isSibling = parentPath(key) === parentPath(renamedTo);
      const finalConfidence = fuzzyConfidence ?? (isSibling ? Math.max(confidence, 0.9) : confidence);
      enriched.push({
        type: "renamed",
        path: key,
        newPath: renamedTo,
        old: fa[key],
        new: fb[renamedTo],
        confidence: Math.round(finalConfidence * 100) / 100,
      });
      consumedAdditions.add(renamedTo);
      continue;
    }

    // Move match: same leaf name + value, different path.
    const movePool = fbOnlyByLeafValue.get(leaf + "\0" + ser);
    let movedTo: string | null = null;
    if (movePool) {
      const keyDepth = key.split(".").length;
      for (const fbKey of movePool) {
        if (consumedAdditions.has(fbKey)) continue;
        if (keyDepth <= 3 && fbKey.split(".").length === keyDepth) { movedTo = fbKey; break; }
        if (isRelated(key, fbKey)) { movedTo = fbKey; break; }
      }
    }

    // Fuzzy move fallback.
    if (!movedTo) {
      let bestScore = -1;
      let bestKey: string | null = null;
      for (const fbKey of bKeys) {
        if (fbKey in fa || consumedAdditions.has(fbKey)) continue;
        if (leafName(fbKey) !== leaf) continue;
        const score = matchScore(key, fbKey, fa[key], fb[fbKey]);
        if (score >= FUZZY_THRESHOLD && score > bestScore) {
          bestScore = score;
          bestKey = fbKey;
        }
      }
      if (bestKey !== null) movedTo = bestKey;
    }

    if (movedTo) {
      const shared = sharedAncestorDepth(key, movedTo);
      const maxDepth = Math.max(key.split(".").length, movedTo.split(".").length);
      const moveConfidence = maxDepth > 0 ? shared / maxDepth : 1;
      enriched.push({
        type: "moved",
        path: key,
        newPath: movedTo,
        old: fa[key],
        new: fb[movedTo],
        confidence: Math.round(moveConfidence * 100) / 100,
      });
      consumedAdditions.add(movedTo);
      continue;
    }

    // No match — keep the removed entry as-is.
    enriched.push(entry);
  }

  // Re-emit unconsumed added entries in their original positions.
  for (const entry of structural) {
    if (entry.type !== "added") continue;
    if (consumedAdditions.has(entry.path)) continue;
    enriched.push(entry);
  }

  return enriched;
}

export function computeDiff(a: unknown, b: unknown): DiffResult[] {
  const fa = flatten(a);
  const fb = flatten(b);
  const structural = computeStructuralDiff(fa, fb);
  return enrichDiffWithRenames(structural, fa, fb);
}

// Backward-compat: the previous diffFlatMaps API is preserved as a single
// call that runs both passes (matches the old single-pass behavior).
export function diffFlatMaps(fa: FlatMap, fb: FlatMap): DiffResult[] {
  const structural = computeStructuralDiff(fa, fb);
  return enrichDiffWithRenames(structural, fa, fb);
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}
