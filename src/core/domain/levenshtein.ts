import { leafName } from './flatten.js';

export const FUZZY_THRESHOLD = 0.65;

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two-row rolling array: O(min(n,m)) space
  if (m < n) return levenshtein(b, a); // ensure a is the longer string

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  // Array accesses below are bounds-safe by construction (prev/curr are
  // both length n+1, loops stay within [0..n]). The non-null assertions
  // silence noUncheckedIndexedAccess without runtime cost.
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1,       // deletion
        curr[j - 1]! + 1,   // insertion
        prev[j - 1]! + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n]!;
}

export function pathSimilarity(oldPath: string, newPath: string): number {
  const oldLeaf = leafName(oldPath);
  const newLeaf = leafName(newPath);
  const maxLen = Math.max(oldLeaf.length, newLeaf.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(oldLeaf, newLeaf) / maxLen;
}

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function valueSimilarity(a: unknown, b: unknown): number {
  if (serialize(a) === serialize(b)) return 1.0;

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

export function matchScore(
  oldPath: string,
  newPath: string,
  oldVal: unknown,
  newVal: unknown
): number {
  const score = 0.6 * pathSimilarity(oldPath, newPath) + 0.4 * valueSimilarity(oldVal, newVal);
  return Math.round(score * 100) / 100;
}
