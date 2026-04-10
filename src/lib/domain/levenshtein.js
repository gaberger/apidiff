// Fuzzy rename detection — pure domain functions, zero external imports
// Plain JS mirror of src/core/domain/levenshtein.ts (for Base44 platform)

import { leafName } from './flatten.js';

export const FUZZY_THRESHOLD = 0.65;

export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Ensure a is the longer string (O(min(n,m)) space)
  if (m < n) return levenshtein(b, a);

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost  // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

export function pathSimilarity(oldPath, newPath) {
  const oldLeaf = leafName(oldPath);
  const newLeaf = leafName(newPath);
  const maxLen = Math.max(oldLeaf.length, newLeaf.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(oldLeaf, newLeaf) / maxLen;
}

function serializeLocal(value) {
  return JSON.stringify(value);
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function valueSimilarity(a, b) {
  if (serializeLocal(a) === serializeLocal(b)) return 1.0;

  if (typeof a === 'string' && typeof b === 'string') {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    return 1 - levenshtein(a, b) / maxLen;
  }

  if (typeof a === 'number' && typeof b === 'number') {
    const max = Math.max(Math.abs(a), Math.abs(b));
    if (max === 0) return 1.0;
    return 1 - Math.abs(a - b) / max;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = new Set(Object.keys(a));
    const keysB = new Set(Object.keys(b));
    const union = new Set([...keysA, ...keysB]);
    if (union.size === 0) return 1.0;
    let intersection = 0;
    for (const k of keysA) {
      if (keysB.has(k)) intersection++;
    }
    return intersection / union.size;
  }

  return 0.0;
}

export function matchScore(oldPath, newPath, oldVal, newVal) {
  const score = 0.6 * pathSimilarity(oldPath, newPath) + 0.4 * valueSimilarity(oldVal, newVal);
  return Math.round(score * 100) / 100;
}
