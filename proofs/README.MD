# Formal Verification of the APIDIFF Diff Algorithm

Machine-checked proofs (Coq/Rocq) that the core diff classification in
`src/core/domain/diff-algorithm.ts` is total, deterministic, and structurally
consistent.

## Why formally verify a diff algorithm?

The diff algorithm is the foundation of everything APIDIFF produces: the change
table, the migration guide, the checklist, the code examples. If the classifier
misidentifies a rename as a removal, users get wrong migration advice. If a key
slips through unclassified, it silently disappears from the guide.

Unit tests check specific inputs. These proofs check **all possible inputs**.

## What's modeled

The Coq development models the **flat-map diff** stage of the pipeline -- the
core logic in `diffFlatMaps()` that takes two `Record<string, unknown>` maps and
classifies every key into a change type.

| TypeScript | Coq model |
|---|---|
| `FlatMap` (`Record<string, unknown>`) | `list (Key * Value)` with `lookup` |
| `ChangeType` union | `Inductive ChangeType` with 7 constructors |
| `diffFlatMaps` per-key logic | `classify_key` function |
| `findRename` | `is_rename` predicate |
| `findMove` | `is_move` predicate |
| `JSON.stringify` equality | `value_eq_dec` (decidable equality) |
| `describeType` | `type_of` with `typedesc_eq_dec` |
| `leafName` | Parameterized `leafName` with decidable equality |

Values and type descriptors are **opaque parameters** -- the proofs hold for any
value type, not just JSON. This makes the guarantees stronger: the algorithm's
correctness doesn't depend on the serialization format.

The development also models:

- **`flatten()`** -- The JSON-to-flat-map conversion, including the decisions
  about which JSON values are leaves (arrays, nulls, empty objects) vs. which
  recurse (non-empty objects). Modeled as an inductive `Json` type with a
  fuel-bounded `flatten_aux` function.

- **The `processed` set loop** -- The main `for (const key of allKeys)` loop
  from `diffFlatMaps`, modeled as a `step` function over a `LoopState` record
  (remaining keys, processed set, accumulated results).

| TypeScript | Coq model |
|---|---|
| `FlatMap` (`Record<string, unknown>`) | `list (Key * Value)` with `lookup` |
| `ChangeType` union | `Inductive ChangeType` with 7 constructors |
| `diffFlatMaps` per-key logic | `classify_key` function |
| `findRename` | `is_rename` predicate |
| `findMove` | `is_move` predicate |
| `JSON.stringify` equality | `value_eq_dec` (decidable equality) |
| `describeType` | `type_of` with `typedesc_eq_dec` |
| `leafName` | Parameterized `leafName` with decidable equality |
| JSON values | `Inductive Json` (JNull, JBool, JNum, JStr, JArr, JObj) |
| `flatten()` | `flatten_aux` with fuel-bounded recursion |
| `is_leaf` check (lines 9-29) | `is_leaf` / `is_leaf_b` predicates |
| `for (const key of allKeys)` loop | `step` / `run_loop` over `LoopState` |
| `processed` Set | `ProcessedSet` (list Key with `In` membership) |

## Proven theorems (25 total)

### Structural correctness (DiffProofs.v)

| # | Theorem | What it guarantees |
|---|---|---|
| 1 | `rename_move_exclusive` | A key pair cannot be both renamed AND moved. The `leafName` check in `findRename` (different name) and `findMove` (same name) are logically exhaustive and mutually exclusive. |
| 8 | `rename_asymmetric` | If `billing -> collection_method` is a rename, then `collection_method -> billing` cannot also be a rename. Prevents cycles in the `processed` set. |

### Classification soundness (DiffProofs.v)

| # | Theorem | What it guarantees |
|---|---|---|
| 4 | `unchanged_means_equal` | When `classify_key` returns `Unchanged`, the values are genuinely identical. No false negatives. |
| 5 | `type_change_means_different_types` | When `classify_key` returns `TypeChange`, `type_of` genuinely differs. No false positive type changes. |
| 6 | `removed_means_absent` | `Removed` means the key genuinely does not exist in the new map. |
| 7 | `added_means_absent` | `Added` means the key genuinely does not exist in the old map. |

### Totality and determinism (DiffProofs.v)

| # | Theorem | What it guarantees |
|---|---|---|
| 2 | `classify_total` | Every key in the union of both maps receives a classification. No key falls through unhandled. |
| 3 | `classify_deterministic` | Same inputs always produce the same output (purity). |

### Flatten correctness (FlattenModel.v)

| # | Theorem | What it guarantees |
|---|---|---|
| F1 | `flatten_leaf_singleton` | Any leaf value (non-object, or empty object) with a non-empty prefix produces exactly one flat map entry. |
| F2 | `flatten_null_is_leaf` | `null` never triggers recursion — always stored as a leaf. |
| F3 | `flatten_array_is_leaf` | Arrays are never recursed into — stored as leaf values at their path. |
| F4 | `flatten_empty_obj_is_leaf` | Empty objects `{}` are treated as terminal values, not recursed. |
| F5 | `flatten_single_field` | A single-field object `{ key: leaf }` produces exactly `[(prefix.key, leaf)]`. |

### Loop invariants (LoopInvariant.v)

| # | Theorem | What it guarantees |
|---|---|---|
| L1 | `step_processed_monotone` | The processed set only grows — keys are never removed. |
| L2 | `step_adds_current_key` | Every non-skipped key enters the processed set. |
| L3 | `skip_means_processed` | If a key is skipped, it was already in the processed set. |
| L4 | `step_adds_one_result` | Each non-skip iteration adds exactly one DiffResult. |
| L5 | `step_shrinks_remaining` | The remaining-keys list shrinks by one each step (termination). |

### OpenAPI 2.0/3.0 constraints (OpenAPIConstraints.v)

By restricting inputs to valid OpenAPI response bodies, we gain structural
invariants that close the gaps left by the general-purpose proofs above.

| # | Theorem | What it guarantees |
|---|---|---|
| OA1 | `well_formed_root_unique` | Well-formed JSON has unique field names at the root level. |
| OA2 | `leaf_classification_sound` | Every value our flatten treats as a leaf IS a proper leaf (no non-empty objects accidentally treated as terminals). |
| OA3 | `non_empty_obj_not_leaf` | Non-empty objects are never classified as leaves — flatten always recurses into them. |
| OA4 | `depth_zero_all_leaves` | Depth-0 JSON consists entirely of leaf values (base case for induction). |
| OA5 | `well_formed_field` | Well-formedness propagates to child fields — enables inductive reasoning over nested structures. |
| OA6 | `openapi_fuel_sufficient` | The depth bound (10) ensures flatten's fuel parameter never truncates an OpenAPI response body. |
| OA7 | `flatten_preserves_leaf_type` | Flattened entries always contain proper leaf values (combines F1 + OA2). |

**Key constraints modeled:**

- **`well_formed`** -- Recursive predicate requiring unique field names at every
  nesting level. Maps to JSON RFC 7159's unique-key recommendation, which OpenAPI
  requires.
- **`bounded_depth`** -- OpenAPI response bodies have depth <= 10 after `$ref`
  resolution (no recursive schemas). This makes `flatten_aux`'s fuel parameter
  provably sufficient.
- **`proper_leaf`** -- Leaf values are primitives or arrays, never non-empty
  objects. This ensures flatten's leaf/recurse boundary is always correct for
  OpenAPI inputs.

## What's NOT proven (honest limitations)

- **First-match semantics** -- When multiple candidates exist for a rename/move,
  the TypeScript code picks the first match. The proofs don't constrain which
  candidate is selected, only that the classification of the selected pair is
  sound.
- **Full NoDup propagation** -- `well_formed` guarantees unique field names at
  each level, and `flatten_preserves_leaf_type` guarantees correct leaf handling,
  but we don't yet compose these into a single end-to-end `FlatNoDupKeys` theorem
  for arbitrarily nested objects (the per-level uniqueness + depth bound make
  this provable but the proof is mechanical and lengthy).

## Building

Requires [Rocq/Coq](https://coq.inria.fr/) >= 9.1.

```bash
cd proofs/
coqc -Q . "" DiffModel.v
coqc -Q . "" FlattenModel.v
coqc -Q . "" DiffProofs.v
coqc -Q . "" LoopInvariant.v
coqc -Q . "" OpenAPIConstraints.v
```

All files must compile with **zero errors**. Warnings about non-recursive
fixpoints on `leaf_name` are expected and harmless.

## File structure

```
proofs/
  DiffModel.v            Model: types, flat map ops, classify_key,
                         is_rename/is_move predicates
  FlattenModel.v         Model: JSON type, flatten function, leaf predicates
  DiffProofs.v           8 theorems on classification correctness
  LoopInvariant.v        5 theorems on the processed-set loop
  OpenAPIConstraints.v   7 theorems on OpenAPI 2.0/3.0 structural invariants
  README.md              This file
```

### Dependency order

```
DiffModel.v ─────┬──→ DiffProofs.v
                  └──→ LoopInvariant.v
FlattenModel.v ──────→ OpenAPIConstraints.v
```

## Correspondence to source code

| Proof concept | Source location |
|---|---|
| `classify_key` match arms | `diff-algorithm.ts:24-61` |
| `is_rename` predicate | `diff-algorithm.ts:69-79` (`findRename`) |
| `is_move` predicate | `diff-algorithm.ts:82-91` (`findMove`) |
| `leafName` function | `flatten.ts:55-58` |
| `ChangeType` inductive | `types.ts:3-10` |
| `value_eq_dec` (serialize) | `diff-algorithm.ts:93-95` |
| `type_of` / `describeType` | `flatten.ts:60-65` |
| `Json` inductive type | `flatten.ts:6-53` (runtime JSON values) |
| `flatten_aux` function | `flatten.ts:6-53` |
| `is_leaf` / `is_leaf_b` | `flatten.ts:9-29` (leaf-vs-recurse check) |
| `dot_join` | `flatten.ts:35` (prefix + "." + key) |
| `LoopState` record | `diff-algorithm.ts:13-15` (allKeys, processed, results) |
| `step` function | `diff-algorithm.ts:18-64` (one loop iteration) |
| `well_formed` predicate | OpenAPI 2.0/3.0 spec: unique field names per object |
| `bounded_depth` / `json_depth` | OpenAPI response bodies post-`$ref` resolution |
| `proper_leaf` predicate | `flatten.ts:9-29` (leaf types in OpenAPI context) |
