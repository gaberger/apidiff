# ADR-003: Pure Domain Diff Algorithm

## Status
Accepted

## Date
2026-04-08

## Authors
Gary Berger

## Context
The response diff engine must compare two JSON objects and classify each change semantically (renamed, moved, type-changed, etc.) rather than syntactically. This is the core value proposition of the toolkit. The algorithm needs to be deterministic, side-effect-free, and fast for typical API responses (< 200 fields).

## Decision
Implement the diff algorithm as pure functions in the domain layer:

1. **Flatten** — recursive depth-first traversal producing dot-notation flat maps
2. **Diff** — set-based comparison of flat maps with rename/move detection

Key design choices:
- Arrays are leaf values (not traversed by index) — avoids false positives from reordering
- Empty objects `{}` are leaf values — preserves structural info
- Rename detection: O(n²) scan for same-value-at-different-key, acceptable for < 1000 fields
- Move detection: same leaf name and value at different nesting path
- No external dependencies — the entire algorithm is < 100 lines of pure TypeScript

## Consequences
- Algorithm is trivially testable — input JSON in, DiffResult[] out
- No dependency on any framework or runtime-specific API
- O(n²) rename detection is a known bottleneck for very large schemas; ADR-003a will address this with a value-to-keys reverse index if needed
- The flat map intermediate form enables future features (path filtering, impact analysis) without algorithm changes
