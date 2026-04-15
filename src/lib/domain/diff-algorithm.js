// src/core/domain/flatten.ts
function flatten(obj, prefix = "") {
  const result = {};
  if (obj === null || obj === undefined) {
    if (prefix)
      result[prefix] = obj;
    return result;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      if (prefix)
        result[prefix] = obj;
      return result;
    }
    if (typeof obj[0] === "object" && obj[0] !== null && !Array.isArray(obj[0])) {
      for (let i = 0;i < obj.length; i++) {
        const item = obj[i];
        const itemKey = typeof item.name === "string" ? item.name : typeof item.id === "string" ? item.id : typeof item.$ref === "string" ? item.$ref : Object.keys(item).length > 0 ? `[${Object.keys(item)[0]}:${String(Object.values(item)[0]).slice(0, 30)}]` : String(i);
        const path = prefix ? `${prefix}.${itemKey}` : itemKey;
        Object.assign(result, flatten(item, path));
      }
      return result;
    }
    if (prefix)
      result[prefix] = obj;
    return result;
  }
  if (typeof obj !== "object") {
    if (prefix)
      result[prefix] = obj;
    return result;
  }
  const record = obj;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    if (prefix)
      result[prefix] = obj;
    return result;
  }
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = record[key];
    if (value !== null && value !== undefined && typeof value === "object" && Object.keys(value).length > 0) {
      Object.assign(result, flatten(value, path));
    } else {
      result[path] = value;
    }
  }
  return result;
}
function leafName(path) {
  const parts = path.split(".");
  return parts[parts.length - 1] ?? path;
}
function describeType(value) {
  if (value === null)
    return "null";
  if (value === undefined)
    return "undefined";
  if (Array.isArray(value))
    return `array[${value.length}]`;
  return typeof value;
}

// src/core/domain/levenshtein.ts
var FUZZY_THRESHOLD = 0.65;
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0)
    return n;
  if (n === 0)
    return m;
  if (m < n)
    return levenshtein(b, a);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1;i <= m; i++) {
    curr[0] = i;
    for (let j = 1;j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
function pathSimilarity(oldPath, newPath) {
  const oldLeaf = leafName(oldPath);
  const newLeaf = leafName(newPath);
  const maxLen = Math.max(oldLeaf.length, newLeaf.length);
  if (maxLen === 0)
    return 1;
  return 1 - levenshtein(oldLeaf, newLeaf) / maxLen;
}
function serialize(value) {
  return JSON.stringify(value);
}
function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function valueSimilarity(a, b) {
  if (serialize(a) === serialize(b))
    return 1;
  if (typeof a === "string" && typeof b === "string") {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0)
      return 1;
    return 1 - levenshtein(a, b) / maxLen;
  }
  if (typeof a === "number" && typeof b === "number") {
    const max = Math.max(Math.abs(a), Math.abs(b));
    if (max === 0)
      return 1;
    return 1 - Math.abs(a - b) / max;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = new Set(Object.keys(a));
    const keysB = new Set(Object.keys(b));
    const union = new Set([...keysA, ...keysB]);
    if (union.size === 0)
      return 1;
    let intersection = 0;
    for (const k of keysA) {
      if (keysB.has(k))
        intersection++;
    }
    return intersection / union.size;
  }
  return 0;
}
function matchScore(oldPath, newPath, oldVal, newVal) {
  const score = 0.6 * pathSimilarity(oldPath, newPath) + 0.4 * valueSimilarity(oldVal, newVal);
  return Math.round(score * 100) / 100;
}

// src/core/domain/diff-algorithm.ts
function parentPath(path) {
  const idx = path.lastIndexOf(".");
  return idx > 0 ? path.slice(0, idx) : "";
}
function sharedAncestorDepth(a, b) {
  const partsA = a.split(".");
  const partsB = b.split(".");
  let shared = 0;
  for (let i = 0;i < Math.min(partsA.length, partsB.length); i++) {
    if (partsA[i] === partsB[i])
      shared++;
    else
      break;
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
  if (partsA[0] === "components" && partsA[1] === "schemas" && partsB[0] === "components" && partsB[1] === "schemas") {
    if (partsA.length >= 3 && partsB.length >= 3 && partsA[2] !== partsB[2]) {
      return false;
    }
  }
  const required = depth <= 3 ? 1 : depth <= 6 ? 2 : Math.max(3, Math.ceil(depth * 0.4));
  return shared >= required;
}
var FUZZY_SIZE_LIMIT = 500;
var FUZZY_MOVE_SIZE_LIMIT = 200;
var REMOVED_SIZE_SKIP = 100;
function computeStructuralDiff(fa, fb) {
  const results = [];
  const aKeys = Object.keys(fa);
  const bKeys = Object.keys(fb);
  const allKeys = new Set([...aKeys, ...bKeys]);
  for (const key of allKeys) {
    const inA = key in fa;
    const inB = key in fb;
    if (inA && inB) {
      const oldVal = fa[key];
      const newVal = fb[key];
      if (serialize2(oldVal) === serialize2(newVal)) {
        results.push({ type: "unchanged", path: key, old: oldVal, new: newVal });
      } else if (describeType(oldVal) !== describeType(newVal)) {
        results.push({
          type: "type-change",
          path: key,
          old: oldVal,
          new: newVal,
          oldType: describeType(oldVal),
          newType: describeType(newVal)
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
function enrichDiffWithRenames(structural, fa, fb, signal) {
  const aKeys = Object.keys(fa);
  const bKeys = Object.keys(fb);
  const removedCount = structural.filter((e) => e.type === "removed").length;
  const fuzzyRenameEnabled = removedCount <= REMOVED_SIZE_SKIP && bKeys.length <= FUZZY_SIZE_LIMIT && aKeys.length <= FUZZY_SIZE_LIMIT;
  const fuzzyMoveEnabled = removedCount <= REMOVED_SIZE_SKIP && bKeys.length <= FUZZY_MOVE_SIZE_LIMIT && aKeys.length <= FUZZY_MOVE_SIZE_LIMIT;
  const fbOnlyByValue = new Map;
  const fbOnlyByLeafValue = new Map;
  for (const fbKey of bKeys) {
    if (fbKey in fa)
      continue;
    const ser = serialize2(fb[fbKey]);
    const leaf = leafName(fbKey);
    let byVal = fbOnlyByValue.get(ser);
    if (!byVal) {
      byVal = [];
      fbOnlyByValue.set(ser, byVal);
    }
    byVal.push(fbKey);
    const leafKey = leaf + "\x00" + ser;
    let byLeaf = fbOnlyByLeafValue.get(leafKey);
    if (!byLeaf) {
      byLeaf = [];
      fbOnlyByLeafValue.set(leafKey, byLeaf);
    }
    byLeaf.push(fbKey);
  }
  const consumedAdditions = new Set;
  const enriched = [];
  let aborted = false;
  for (let i = 0;i < structural.length && !aborted; i++) {
    const entry = structural[i];
    if (entry.type === "added")
      continue;
    if (entry.type !== "removed") {
      enriched.push(entry);
      continue;
    }
    const key = entry.path;
    const oldVal = fa[key];
    const ser = serialize2(oldVal);
    const leaf = leafName(key);
    let renamedTo = null;
    let fuzzyConfidence = null;
    const renamePool = fbOnlyByValue.get(ser);
    if (renamePool) {
      const keyParent = parentPath(key);
      for (const fbKey of renamePool) {
        if (consumedAdditions.has(fbKey))
          continue;
        if (leafName(fbKey) === leaf)
          continue;
        if (parentPath(fbKey) === keyParent) {
          renamedTo = fbKey;
          break;
        }
        if (isRelated(key, fbKey)) {
          renamedTo = fbKey;
          break;
        }
      }
    }
    if (!renamedTo && fuzzyRenameEnabled) {
      let bestScore = -1;
      let bestKey = null;
      for (const fbKey of bKeys) {
        if (signal?.aborted) {
          aborted = true;
          break;
        }
        if (fbKey in fa || consumedAdditions.has(fbKey))
          continue;
        if (leafName(fbKey) === leaf)
          continue;
        if (!isRelated(key, fbKey))
          continue;
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
        confidence: Math.round(finalConfidence * 100) / 100
      });
      consumedAdditions.add(renamedTo);
      continue;
    }
    const movePool = fbOnlyByLeafValue.get(leaf + "\x00" + ser);
    let movedTo = null;
    if (movePool) {
      const keyDepth = key.split(".").length;
      for (const fbKey of movePool) {
        if (consumedAdditions.has(fbKey))
          continue;
        if (keyDepth <= 3 && fbKey.split(".").length === keyDepth) {
          movedTo = fbKey;
          break;
        }
        if (isRelated(key, fbKey)) {
          movedTo = fbKey;
          break;
        }
      }
    }
    if (!movedTo && fuzzyMoveEnabled) {
      let bestScore = -1;
      let bestKey = null;
      for (const fbKey of bKeys) {
        if (signal?.aborted) {
          aborted = true;
          break;
        }
        if (fbKey in fa || consumedAdditions.has(fbKey))
          continue;
        if (leafName(fbKey) !== leaf)
          continue;
        if (!isRelated(key, fbKey))
          continue;
        const score = matchScore(key, fbKey, fa[key], fb[fbKey]);
        if (score >= FUZZY_THRESHOLD && score > bestScore) {
          bestScore = score;
          bestKey = fbKey;
        }
      }
      if (bestKey !== null)
        movedTo = bestKey;
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
        confidence: Math.round(moveConfidence * 100) / 100
      });
      consumedAdditions.add(movedTo);
      continue;
    }
    enriched.push(entry);
  }
  for (const entry of structural) {
    if (entry.type !== "added")
      continue;
    if (consumedAdditions.has(entry.path))
      continue;
    enriched.push(entry);
  }
  return enriched;
}
function computeDiff(a, b) {
  const fa = flatten(a);
  const fb = flatten(b);
  const structural = computeStructuralDiff(fa, fb);
  return enrichDiffWithRenames(structural, fa, fb);
}
function diffFlatMaps(fa, fb) {
  const structural = computeStructuralDiff(fa, fb);
  return enrichDiffWithRenames(structural, fa, fb);
}
function serialize2(value) {
  return JSON.stringify(value);
}
export {
  enrichDiffWithRenames,
  diffFlatMaps,
  computeStructuralDiff,
  computeDiff
};
