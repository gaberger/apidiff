# ADR-002: Bun as Runtime and Build Tool

## Status
Accepted

## Date
2026-04-08

## Authors
Gary Berger

## Context
The toolkit needs a JavaScript/TypeScript runtime for the diff engine and web UI, plus a build tool for compiling the CLI to a distributable binary. Node.js + esbuild/webpack is the traditional choice. Bun offers an integrated runtime, bundler, test runner, and package manager.

## Decision
Use Bun as the sole runtime and build tool. Specifically:

- `bun run` for development execution
- `bun build` for compiling CLI to standalone binary
- `bun test` for unit and integration tests
- `bun install` for dependency management
- `Bun.serve()` for the web UI HTTP server
- `Bun.file()` / `Bun.write()` for file I/O in adapters

## Consequences
- Single toolchain — no separate test runner, bundler, or package manager config
- Fast cold starts for CLI usage (Bun's startup time is ~5x faster than Node)
- Built-in `Bun.serve()` eliminates the need for Express/Fastify in the web adapter
- `bun build --compile` produces a single binary for distribution
- Bun-specific APIs (`Bun.file`, `Bun.spawn`) are isolated to secondary adapters — the domain layer uses no Bun APIs
- Trade-off: Bun is less mature than Node.js in edge cases, but the toolkit's I/O requirements are straightforward
