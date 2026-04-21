# ADR-005: Schema Diff via oasdiff Binary

## Status
Accepted

## Date
2026-04-08

## Authors
Gary Berger

## Context
Schema-level API diffing (comparing two OpenAPI specs) is a solved problem. The oasdiff project (Go binary) provides comprehensive OpenAPI diff with breaking change detection, deprecation tracking, and multiple output formats. Reimplementing this in TypeScript would be significant effort for inferior results.

## Decision
Wrap the oasdiff binary as a secondary adapter behind the `OasdiffPort` interface. The adapter:

- Locates or suggests installation of the oasdiff binary
- Passes spec file paths and mode flags to oasdiff via `Bun.spawn()`
- Parses exit codes (0 = clean, 1 = breaking changes found)
- Counts change types from text output for summary statistics

The domain layer never directly interacts with oasdiff — the `SchemaDiffService` use case orchestrates through ports.

## Consequences
- Leverages a mature, well-tested Go binary for OpenAPI diffing
- The oasdiff binary is an external dependency that must be installed separately
- The adapter isolates all oasdiff interaction — if oasdiff is replaced, only the adapter changes
- Schema fetching (HTTP download to temp file) is a separate adapter, keeping concerns decoupled
- CI integration works via exit codes — `--fail-on-breaking` maps to process.exit(1)
