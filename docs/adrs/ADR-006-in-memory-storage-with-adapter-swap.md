# ADR-006: In-Memory Storage with Adapter Swap Path

## Status
Accepted

## Date
2026-04-08

## Authors
Gary Berger

## Context
The migration guide viewer has a checklist feature where users mark items as complete. The DESIGN.md specifies localStorage persistence in the browser. The CLI has no persistence requirement. The question is how to model storage in the hex architecture.

## Decision
Define a `ChecklistStoragePort` interface and provide an in-memory implementation as the default secondary adapter. The web adapter can later provide a localStorage-backed implementation without changing the domain or use case layers.

Storage implementations:
- **MemoryChecklistStorage** (current) — Map-based, suitable for CLI and tests
- **LocalStorageAdapter** (future) — keyed by `migration-checklist-${btoa(base:revision)}`, for browser
- **FileStorageAdapter** (future) — JSON file on disk, for persistent CLI workflows

## Consequences
- The domain and use case layers are storage-agnostic from day one
- Tests use in-memory storage (fast, no cleanup)
- Adding localStorage support requires only a new adapter + composition root wiring
- No premature abstraction — the interface is exactly what the use cases need, nothing more
