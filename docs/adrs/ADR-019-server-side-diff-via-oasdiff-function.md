# ADR-019: Server-Side Diff via base44 Function + oasdiff

## Status
Proposed

## Date
2026-04-14

## Context
Even after offloading `$RefParser.dereference` + `computeDiff` to a Web Worker (post-ADR-018 work), the compute itself is the bottleneck for multi-MB real-world API specs:

- GitHub REST API spec: 5-20 MB per version, thousands of `$ref` references. Dereference alone takes 30-120s in pure JS.
- `computeDiff` is O(n) in the flattened spec but the flattening step allocates millions of path strings for large specs.
- The Web Worker fixes UI responsiveness; it does not fix the wall-clock cost. Users still wait 60-180s for real diffs.

Meanwhile:
- ADR-005 already chose **oasdiff** (Go binary, mature, breaking-change detection) as the canonical diff engine for the CLI, behind the `OasdiffPort` interface.
- base44 already hosts server functions (`proxyFetch`, `discoverApi`, `syncIntegrationSpecs`). These are Bun-compatible lambdas with full Node API access — including the ability to invoke a native `oasdiff` binary.
- The server has three decisive advantages over any client-side compute:
  1. **Native speed.** oasdiff (Go) is 10-100× faster than pure-JS diff on large specs.
  2. **Cross-session caching.** Results keyed by `(sha256(spec_a), sha256(spec_b))` are reusable across ALL users. Once anyone has compared Stripe v1 → v2, everyone gets an instant response.
  3. **No browser bundle cost.** We avoid shipping a ~5MB WASM diff engine.

The alternative — compiling oasdiff to WASM and running it in the browser worker — solves the compute speed problem but not the cross-user caching, and inflates the bundle heavily.

## Decision

Ship a **base44 diffSpecs function** that performs dereference + diff server-side via oasdiff, keeping the existing client-side pipeline as a fallback.

### 1. New server function: `base44/functions/diffSpecs`
Accepts `{ url_a, url_b, mode }` where `mode ∈ { 'structural', 'breaking-only' }`.

Pipeline:
1. Hash-check the result cache keyed by `sha256(url_a) || sha256(url_b) || mode`. Return cached result on hit.
2. Download both specs via the existing proxyFetch logic (server-internal call, reusing its cache).
3. Invoke oasdiff via `Bun.spawn(['oasdiff', 'diff', path_a, path_b, '--format', 'json'])`.
4. Transform oasdiff's JSON output into the repo's `DiffResult[]` shape via a pure adapter function (reuses existing oasdiff-to-domain mapping from ADR-005).
5. Persist to cache with a TTL (default 24h, extended on hit).
6. Return `{ results, breakingCount, refsResolved, computedAt, cacheHit }`.

### 2. Client-side integration
Add `src/lib/remote-diff.js` — thin fetch wrapper calling the base44 function with onProgress callbacks that match the existing FetchProgress banner vocabulary (stages: `requesting-diff`, `server-dereferencing`, `server-diffing`, `done`).

`src/hooks/use-diff-worker.js` gains a new mode: attempts remote-diff first, falls back to local Worker if the server returns 5xx or the network fails. Fallback path continues to work for offline / private-spec use cases.

### 3. Flag control
Wire a `preferLocalDiff` flag in Settings that defaults to `false`. Users who don't want their spec URLs sent to the server (or who are testing purely local specs) can flip the flag to force the Worker path.

### 4. Privacy boundary
The diff function only receives **spec URLs**, not spec content. The server fetches independently via proxyFetch — the same path already used by IntegrationHeader today. No new data crosses the trust boundary; the only new thing is that the SERVER now computes the diff rather than just proxying the fetch.

For users pasting raw spec content (SpecInput paste mode), the remote path is skipped entirely — local Worker handles those.

### 5. Hexagonal fit
- `src/core/ports/diff-port.ts` already exists (implied by ADR-005's OasdiffPort). New adapter `src/adapters/secondary/base44-diff-adapter.ts` implements it by calling the base44 function.
- Local Worker remains the `in-process-diff-adapter.ts`.
- `composition-root` wires adapter selection based on `preferLocalDiff` flag.

## Consequences

### Positive
- **10-100× faster diffs** on large specs. GitHub v2022 → v2026 drops from ~60s to ~3s.
- **Cross-user result cache.** Popular comparisons are effectively free after the first user triggers them.
- **No browser bundle bloat.** Avoids a multi-MB WASM payload for a feature 90% of users run occasionally.
- **oasdiff's breaking-change detection** surfaces directly — ADR-017's severity classification gets a canonical source instead of our hand-rolled classifier.
- **Works offline via fallback.** The Worker path stays, so the app remains functional without the server.

### Negative
- **Server dependency on oasdiff binary.** The base44 runtime must have the binary installed. Mitigated by CI/deployment bundling oasdiff in the function's container image, or downloading it at cold-start if absent.
- **Cache invalidation risk.** If a provider re-publishes a spec under the same URL, the server cache serves stale diffs until TTL expires. Mitigated by a 24h TTL ceiling and a "Force recompute" button in the UI.
- **Cost and latency of server roundtrip.** For TINY specs (<50KB), the network+serverless startup is SLOWER than local Worker. Mitigated: the client uses local Worker for specs below a size threshold (~200KB JSON).

### Neutral
- `preferLocalDiff` flag adds a Settings surface but no visible complexity.
- Existing `src/workers/diff-worker.js` stays in the codebase as the fallback — not removed.

## Alternatives Considered

**1. Compile oasdiff to WASM and run in browser Worker.**
Rejected as the primary approach. Pros: no server dependency, zero latency for repeat users (browser cache). Cons: ~5-8 MB WASM payload (even gzipped is ~2 MB), no cross-user cache, WASM-in-worker debugging is painful, oasdiff's Go+GC combination doesn't WASM-compile cleanly without `tinygo` or a stripped-down Go runtime. Net: more engineering cost, less ROI. Revisit if users explicitly need offline-first.

**2. Keep pure-JS, just spend more engineering on `computeDiff` performance.**
Rejected. Even the already-applied fixes (3af08da quadratic-hotpath pass) still leave multi-MB specs at minutes of compute. oasdiff is mature and correct; reinventing it in JS is a multi-month effort for worse results.

**3. Full server-only compute, no client fallback.**
Rejected. Offline usage, pasted-spec flow, and server outages all benefit from the Worker fallback. Keeping both paths costs little now that the Worker exists.

**4. Use a 3rd-party diff API (e.g., Bump.sh, Stoplight).**
Rejected. Vendor lock-in, pricing per-call, and data-privacy concerns. We already have the oasdiff binary + base44 infra; no reason to outsource.

## Implementation Plan
See `docs/workplans/wp-adr-019-server-diff.json`.

## References
- ADR-005 — Schema diff via oasdiff binary (CLI path)
- ADR-014 — Design tokens
- ADR-017 — Version-centric IA (severity classification benefits from oasdiff breaking-change output)
- ADR-018 — Spec cache + FetchProgress (this ADR's stages will plug into that banner)
- base44/functions/proxyFetch — reference for the function runtime pattern
- oasdiff — https://github.com/Tufin/oasdiff
