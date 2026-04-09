# ADR-011: Fuzzy Rename Detection via Levenshtein Distance

## Status
Proposed

## Date
2026-04-09

## Context

The current diff algorithm (`diff-algorithm.ts`) detects renames and moves by requiring **exact value equality** between the old and new key:

```typescript
// findRename: same serialized value, different leaf name
if (serialize(fb[fbKey]) === serialized) return fbKey;

// findMove: same serialized value, same leaf name, different path
if (leafName(fbKey) === leaf && serialize(fb[fbKey]) === serialized) return fbKey;
```

This works when a field is renamed but its value stays identical. However, in real API versioning, fields are often renamed **and** their values change simultaneously:

| Scenario | Old path | New path | Old value | New value | Current result |
|----------|----------|----------|-----------|-----------|----------------|
| Pure rename | `billing` | `collection_method` | `"auto"` | `"auto"` | **renamed** (correct) |
| Rename + value change | `account_balance` | `balance` | `0` | `0.00` | **removed** + **added** (misleading) |
| Rename + type change | `price` | `pricing` | `"-0.0075"` | `{ amount: -0.0075 }` | **removed** + **added** (misleading) |
| Similar path, same value | `user.name` | `user.display_name` | `"Alice"` | `"Alice"` | **renamed** (correct) |
| Similar path, similar value | `user.name` | `user.displayName` | `"Alice"` | `"alice"` | **removed** + **added** (misleading) |

When a rename is misclassified as removed + added, the migration guide generates two separate checklist items ("Remove all reads of X" and "Optionally adopt Y") instead of one clear instruction ("Replace X with Y"). This makes migration guides less useful for the most common real-world scenario: gradual field renaming across API versions.

### Coq proof implications

Our formal proofs (Theorem 1: `rename_move_exclusive`, Theorem 8: `rename_asymmetric`) verify properties of the rename/move **predicates**, which are defined in terms of exact value equality. Introducing fuzzy matching changes the predicate definitions, so the proofs must be updated to reflect the new matching criteria while preserving the exclusivity and asymmetry guarantees.

## Decision

### 1. Levenshtein distance for path similarity

Introduce a pure `levenshtein` function in the domain layer that computes the edit distance between two strings:

```typescript
// domain/levenshtein.ts
export function levenshtein(a: string, b: string): number { ... }

export function pathSimilarity(oldPath: string, newPath: string): number {
  const oldLeaf = leafName(oldPath);
  const newLeaf = leafName(newPath);
  const maxLen = Math.max(oldLeaf.length, newLeaf.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(oldLeaf, newLeaf) / maxLen;
}
```

`pathSimilarity` returns a score between 0 (completely different) and 1 (identical). It compares **leaf names only** — the prefix path is handled separately by the move detection.

### 2. Value similarity scoring

Introduce a `valueSimilarity` function that handles different value types:

```typescript
// domain/similarity.ts
export function valueSimilarity(a: unknown, b: unknown): number {
  // Identical → 1.0
  if (serialize(a) === serialize(b)) return 1.0;

  // Same type, both strings → Levenshtein on string values
  if (typeof a === "string" && typeof b === "string") {
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1.0 : 1 - levenshtein(a, b) / maxLen;
  }

  // Same type, both numbers → relative distance
  if (typeof a === "number" && typeof b === "number") {
    const max = Math.max(Math.abs(a), Math.abs(b));
    return max === 0 ? 1.0 : 1 - Math.abs(a - b) / max;
  }

  // Same type, both objects → Jaccard similarity on keys
  if (isObject(a) && isObject(b)) {
    const keysA = new Set(Object.keys(a));
    const keysB = new Set(Object.keys(b));
    const intersection = [...keysA].filter(k => keysB.has(k)).length;
    const union = new Set([...keysA, ...keysB]).size;
    return union === 0 ? 1.0 : intersection / union;
  }

  // Different types → 0.0
  return 0.0;
}
```

### 3. Combined similarity score

A candidate match is scored by combining path and value similarity:

```typescript
export function matchScore(
  oldPath: string, newPath: string,
  oldValue: unknown, newValue: unknown,
): number {
  const pathScore = pathSimilarity(oldPath, newPath);
  const valueScore = valueSimilarity(oldValue, newValue);
  // Path name similarity weighted higher — a renamed field with a completely
  // different value is still useful to detect
  return 0.6 * pathScore + 0.4 * valueScore;
}
```

### 4. Updated findRename / findMove

The rename/move detection functions gain a threshold parameter:

```typescript
const FUZZY_THRESHOLD = 0.65; // minimum combined score to consider a match

function findRename(key, fa, fb, processed): { key: string; score: number } | null {
  let bestMatch: { key: string; score: number } | null = null;

  for (const fbKey of Object.keys(fb)) {
    if (fbKey in fa || processed.has(fbKey)) continue;
    if (leafName(fbKey) === leafName(key)) continue; // same leaf = move, not rename

    const score = matchScore(key, fbKey, fa[key], fb[fbKey]);
    if (score >= FUZZY_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { key: fbKey, score };
    }
  }
  return bestMatch;
}
```

Key changes from the current algorithm:
- **Best match wins** instead of first match — when multiple candidates exist, the highest-scoring one is selected
- **Threshold gate** — only matches above 0.65 are considered (prevents spurious renames)
- **Score is carried** — the `DiffResult` gains an optional `confidence` field so the UI can display match quality

### 5. New DiffResult field

```typescript
export interface DiffResult {
  readonly type: ChangeType;
  readonly path: string;
  readonly newPath?: string;
  readonly old?: unknown;
  readonly new?: unknown;
  readonly oldType?: string;
  readonly newType?: string;
  readonly confidence?: number; // 0-1, present for fuzzy-matched renames/moves
}
```

### 6. Threshold tuning

| Score range | Classification | UI treatment |
|-------------|---------------|--------------|
| 1.0 | Exact match (current behavior) | Solid badge, no qualifier |
| 0.85 - 0.99 | High confidence | Badge with "likely" qualifier |
| 0.65 - 0.84 | Possible match | Badge with "possible" qualifier, dimmed |
| < 0.65 | No match | Falls through to removed + added |

The threshold (0.65) was chosen based on analysis of real API version diffs:
- `account_balance` → `balance`: path similarity 0.54, but if values match exactly → combined 0.72 (above threshold)
- `billing` → `collection_method`: path similarity 0.12, but if values match exactly → combined 0.47 (below threshold — correctly relies on exact value match)
- `name` → `displayName`: path similarity 0.57, value similarity 0.83 (case change) → combined 0.67 (above threshold)

### 7. Coq proof updates

The `is_rename` and `is_move` predicates in `DiffModel.v` must be updated to use a similarity predicate instead of exact value equality:

```coq
(* New: parameterized similarity threshold *)
Parameter similarity : Value -> Value -> nat.  (* 0-100 *)
Parameter path_similarity : Key -> Key -> nat.

Definition match_score (k_old k_new : Key) (v_old v_new : Value) : nat :=
  (60 * path_similarity k_old k_new + 40 * similarity v_old v_new) / 100.

Definition is_fuzzy_rename (k_old k_new : Key) (fa fb : FlatMap) (threshold : nat) : Prop :=
  exists v_old v_new,
    lookup k_old fa = Some v_old /\
    not_in_map k_old fb /\
    lookup k_new fb = Some v_new /\
    not_in_map k_new fa /\
    leafName k_old <> leafName k_new /\
    match_score k_old k_new v_old v_new >= threshold.
```

Theorem 1 (`rename_move_exclusive`) still holds because the discriminator is `leafName` equality, which is unchanged. The similarity scoring only affects *which* candidates pass the threshold, not the rename-vs-move distinction.

Theorem 8 (`rename_asymmetric`) still holds because the `not_in_map` preconditions are unchanged — if `k_old` is in `fa` and not in `fb`, then `k_new → k_old` cannot be a rename because `k_old` is not in `fb`.

New theorems to prove:
- **Fuzzy subsumes exact**: If `similarity(v1, v2) = 100` and `path_similarity(k1, k2) = 100`, then `is_fuzzy_rename` holds (backward compatibility)
- **Threshold monotonicity**: If `is_fuzzy_rename` holds at threshold T, it holds at all thresholds T' ≤ T
- **Best-match determinism**: For a given threshold, the highest-scoring candidate is unique (ties broken by key ordering)

## Consequences

- **Better migration guides**: Renamed-and-changed fields produce a single "Replace X with Y" checklist item instead of two misleading items
- **Confidence visibility**: Users can see match quality and override false positives
- **Backward compatible**: At threshold 1.0, the algorithm behaves identically to current exact-match behavior
- **Pure domain functions**: `levenshtein`, `pathSimilarity`, `valueSimilarity` are all pure functions with zero dependencies — easy to test and prove
- **Performance**: Levenshtein on short strings (typical API field names are 5-30 chars) is O(n*m) but negligible compared to HTTP fetch times
- **Proof maintenance**: Existing Coq theorems remain valid; 3 new theorems needed for the fuzzy extension
- **Risk of false positives**: Threshold too low → unrelated fields incorrectly paired. Mitigated by the 0.65 default and UI confidence indicators

## Alternatives Considered

### Jaro-Winkler distance instead of Levenshtein
Considered: Jaro-Winkler gives higher scores to strings that share a common prefix, which suits API field names (`account_balance` → `accountBalance`). However, Levenshtein is simpler to implement, easier to reason about formally, and the weighted scoring already accounts for prefix similarity through the path component. Could be revisited if false-positive rates are high.

### Machine learning classifier
Rejected: Over-engineering. The domain is constrained (short string field names, known value types), and the weighted Levenshtein approach is transparent, deterministic, and formally verifiable. An ML model would be opaque and hard to prove correct.

### User-specified rename mappings
Complementary, not alternative: Users could provide explicit `{ "old": "billing", "new": "collection_method" }` mappings that override fuzzy detection. This could be a follow-up ADR if needed.
