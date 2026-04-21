# ADR-001: Hexagonal Architecture

## Status
Accepted

## Date
2026-04-08

## Authors
Gary Berger

## Context
The API migration toolkit has three distinct interface surfaces (CLI, Web UI, Library) and multiple external dependencies (oasdiff binary, HTTP schema fetching, browser localStorage). The core diff algorithm and guide generation logic must remain testable in isolation, independent of how they are invoked or where data is stored.

## Decision
Adopt hexagonal (ports and adapters) architecture with strict import boundaries:

- **Domain** — pure business logic (diff algorithm, flattening, guide builder). Zero external imports.
- **Ports** — typed interfaces defining contracts between layers. Import only from domain.
- **Use cases** — application orchestration. Import from domain and ports only.
- **Primary adapters** — driving adapters (CLI, HTTP server). Import from ports only.
- **Secondary adapters** — driven adapters (oasdiff binary, schema fetch, storage). Import from ports only.
- **Composition root** — the single file that wires adapters to ports.

## Consequences
- Domain logic is independently testable with no mocking of external systems
- New interfaces (e.g., VS Code extension) can be added as primary adapters without touching domain code
- Storage backends can be swapped (memory → localStorage → SQLite) by implementing the port interface
- The composition root is the only file that needs to change when swapping adapters
- Slightly more files than a flat structure, but each file has a single, clear responsibility
