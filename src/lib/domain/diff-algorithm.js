// Pure diff algorithm — zero external imports, domain only

import { flatten, leafName, describeType } from "./flatten.js";
import { matchScore, FUZZY_THRESHOLD } from "./levenshtein.js";

function parentPath(path) {
  const idx = path.lastIndexOf(".");
  return idx > 0 ? path.slice(0, idx) : "";
}

function sharedAncestorDepth(a, b) {
  const partsA = a.split(".");
  const partsB = b.split(".");
  let shared = 0;
  for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
    if (partsA[i] === partsB[i]) shared++;
    else break;
  }
  return shared;
}

function isRelated(a, b) {
  const partsA = a.split(".");
  const partsB = b.split(".");
  const depth = Math.max(partsA.length, partsB.length);
  const shared = sharedAncestorDepth(a, b);

  if (partsA[0] === "paths" && partsB[0] === "paths") {
    if (partsA.length >= 3 && partsB.length >= 3) {
      if (partsA[1] !== partsB[1] || partsA[2] !== partsB[2]) {
        return false;
      }
    }
  }

  if (partsA[0] === "components" && partsA[1] === "schemas" &&
      partsB[0] === "components" && partsB[1] === "schemas") {
    if (partsA.length >= 3 && partsB.length >= 3 && partsA[2] !== partsB[2]) {
      return false;
    }
  }

  const required = depth <= 3 ? 1 : depth <= 6 ? 2 : Math.max(3, Math.ceil(depth * 0.4));
  return shared >= required;
}

export function computeDiff(a, b) {
  const fa = flatten(a);
  const fb = flatten(b);
  return diffFlatMaps(fa, fb);
}

export function diffFlatMaps(fa, fb) {
  const results = [];
  const aKeys = Object.keys(fa);
  const bKeys = Object.keys(fb);
  const allKeys = new Set([...aKeys, ...bKeys]);
  const processed = new Set();

  const fbOnlyByValue = new Map();
  const fbOnlyByLeafValue = new Map();

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

      const renamePool = fbOnlyByValue.get(ser);
      let renamedTo = null;
      let fuzzyConfidence = null;
      if (renamePool) {
        const keyParent = parentPath(key);
        for (const fbKey of renamePool) {
          if (processed.has(fbKey)) continue;
          if (leafName(fbKey) === leaf) continue;
          if (parentPath(fbKey) === keyParent) { renamedTo = fbKey; break; }
          if (isRelated(key, fbKey)) { renamedTo = fbKey; break; }
        }
      }

      // Fuzzy rename fallback — fires only when exact-match index misses
      if (!renamedTo) {
        let bestScore = -1;
        let bestKey = null;
        for (const fbKey of Object.keys(fb)) {
          if (fbKey in fa || processed.has(fbKey)) continue;
          if (leafName(fbKey) === leaf) continue; // same leaf = move, not rename
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
        results.push({ type: "renamed", path: key, newPath: renamedTo, old: fa[key], new: fb[renamedTo], confidence: Math.round(finalConfidence * 100) / 100 });
        processed.add(renamedTo);
      } else {
        const movePool = fbOnlyByLeafValue.get(leaf + "\0" + ser);
        let movedTo = null;
        if (movePool) {
          const keyDepth = key.split(".").length;
          for (const fbKey of movePool) {
            if (processed.has(fbKey)) continue;
            if (keyDepth <= 3 && fbKey.split(".").length === keyDepth) { movedTo = fbKey; break; }
            if (isRelated(key, fbKey)) { movedTo = fbKey; break; }
          }
        }

        // Fuzzy move fallback — same leaf name, similar value
        if (!movedTo) {
          let bestScore = -1;
          let bestKey = null;
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
      results.push({ type: "added", path: key, new: fb[key] });
    }

    processed.add(key);
  }

  return results;
}

function serialize(value) {
  return JSON.stringify(value);
}