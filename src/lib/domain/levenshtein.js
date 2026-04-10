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
export {
  valueSimilarity,
  pathSimilarity,
  matchScore,
  levenshtein,
  FUZZY_THRESHOLD
};
