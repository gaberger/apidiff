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
  // they must share the same endpoint (paths.<route>.<method>)
  // to be considered related. This prevents cross-endpoint false matches.
  if (partsA[0] === "paths" && partsB[0] === "paths") {
    // Endpoint = paths.<route>.<method> = first 3 segments
    if (partsA.length >= 3 && partsB.length >= 3) {
      if (partsA[1] !== partsB[1] || partsA[2] !== partsB[2]) {
        return false; // different endpoint — not related
      }
    }
  }

  // Schema boundary: if both are under "components.schemas.",
  // they must share the same schema name
  if (partsA[0] === "components" && partsA[1] === "schemas" &&
      partsB[0] === "components" && partsB[1] === "schemas") {
    if (partsA.length >= 3 && partsB.length >= 3 && partsA[2] !== partsB[2]) {
      return false; // different schema — not related
    }
  }

  // General relatedness: shared ancestor depth threshold
  const required = depth <= 3 ? 1 : depth <= 6 ? 2 : Math.max(3, Math.ceil(depth * 0.4));
  return shared >= required;
}

export function computeDiff(a: unknown, b: unknown): DiffResult[] {
  const fa = flatten(a);
  const fb = flatten(b);
  return diffFlatMaps(fa, fb);
}

// Upper bound on fb size before fuzzy-rename fallback is skipped. Fuzzy matching
// is O(removes × bKeys × pathLen²) due to Levenshtein — on Twilio-scale specs
// (~30k paths) it freezes the UI. Exact rename/move detection still runs for
// any size; this just disables the similarity fallback when pools are huge.
const FUZZY_SIZE_LIMIT = 5000;

export function diffFlatMaps(fa: FlatMap, fb: FlatMap): DiffResult[] {
  const results: DiffResult[] = [];
  const aKeys = Object.keys(fa);
  const bKeys = Object.keys(fb);
  const allKeys = new Set([...aKeys, ...bKeys]);
  const processed = new Set<string>();
  const fuzzyEnabled = bKeys.length <= FUZZY_SIZE_LIMIT && aKeys.length <= FUZZY_SIZE_LIMIT;

  // Pre-build indexes for O(1) rename/move lookups instead of O(n²)
  // Index: serialized value → [keys in fb that are NOT in fa]
  const fbOnlyByValue = new Map<string, string[]>();
  // Index: (leaf+serialized) → [keys in fb that are NOT in fa]
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

  for (const key of allKeys) {
    if (processed.has(key)) continue;

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
      const ser = serialize(fa[key]);
      const leaf = leafName(key);

      // Check for rename: same value, different leaf name
      // Require same parent path OR both are top-level keys
      const renamePool = fbOnlyByValue.get(ser);
      let renamedTo: string | null = null;
      let fuzzyConfidence: number | null = null;
      if (renamePool) {
        const keyParent = parentPath(key);
        for (const fbKey of renamePool) {
          if (processed.has(fbKey)) continue;
          if (leafName(fbKey) === leaf) continue;
          // Same parent (siblings) — always valid rename
          if (parentPath(fbKey) === keyParent) { renamedTo = fbKey; break; }
          // Different parent — require shared ancestor (min 2 levels) to avoid cross-schema matches
          if (isRelated(key, fbKey)) { renamedTo = fbKey; break; }
        }
      }

      // Fuzzy rename fallback — fires only when exact-match index misses AND
      // the spec is small enough that O(n×m) Levenshtein won't freeze the UI.
      // isRelated() is used as a cheap pre-filter so we only run matchScore on
      // candidates sharing an ancestor — matches the semantics that fuzzy
      // renames only make sense within a common path context.
      if (!renamedTo && fuzzyEnabled) {
        let bestScore = -1;
        let bestKey: string | null = null;
        for (const fbKey of bKeys) {
          if (fbKey in fa || processed.has(fbKey)) continue;
          if (leafName(fbKey) === leaf) continue; // same leaf = move, not rename
          if (!isRelated(key, fbKey)) continue;   // cheap O(path) gate before O(path²) matchScore
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
        // Sibling renames (same parent) get high confidence
        const isSibling = parentPath(key) === parentPath(renamedTo);
        const finalConfidence = fuzzyConfidence ?? (isSibling ? Math.max(confidence, 0.9) : confidence);
        results.push({ type: "renamed", path: key, newPath: renamedTo, old: fa[key], new: fb[renamedTo], confidence: Math.round(finalConfidence * 100) / 100 });
        processed.add(renamedTo);
      } else {
        // Check for move: same leaf name + value
        // Require: shared ancestor (min 2) OR same depth with same parent structure
        // This blocks cross-schema false positives while allowing parent renames
        const movePool = fbOnlyByLeafValue.get(leaf + "\0" + ser);
        let movedTo: string | null = null;
        if (movePool) {
          const keyDepth = key.split(".").length;
          for (const fbKey of movePool) {
            if (processed.has(fbKey)) continue;
            // Short paths (<=3): same depth is enough (address.city → location.city)
            if (keyDepth <= 3 && fbKey.split(".").length === keyDepth) { movedTo = fbKey; break; }
            // Longer paths: always require meaningful shared ancestry
            if (isRelated(key, fbKey)) { movedTo = fbKey; break; }
          }
        }

        // Fuzzy move fallback — same leaf name, similar value
        if (!movedTo) {
          let bestScore = -1;
          let bestKey: string | null = null;
          for (const fbKey of Object.keys(fb)) {
            if (fbKey in fa || processed.has(fbKey)) continue;
            if (leafName(fbKey) !== leaf) continue; // must share leaf name for a move
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
          results.push({ type: "moved", path: key, newPath: movedTo, old: fa[key], new: fb[movedTo], confidence: Math.round(moveConfidence * 100) / 100 });
          processed.add(movedTo);
        } else {
          results.push({ type: "removed", path: key, old: fa[key] });
        }
      }
    } else {
      // inB only — added
      results.push({ type: "added", path: key, new: fb[key] });
    }

    processed.add(key);
  }

  return results;
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}
