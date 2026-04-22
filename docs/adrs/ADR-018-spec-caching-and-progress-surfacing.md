# ADR-018: Spec Caching and Progress Surfacing

## Status
Accepted

## Date
2026-04-14

## Authors
Gary Berger

## Context
Spec downloads are APIDIFF's biggest perceived-latency source:

- Every comparison pulls two OpenAPI documents through `base44.functions.invoke('proxyFetch', { url })`. Typical sizes range from 200KB (small APIs) to 5MB+ (Stripe, AWS-class providers). On a warm cable connection that's 1-6 seconds per fetch, and both are serial in some paths.
- Users often re-compare the same version pair across a session (flip category, toggle density, reload). Each flip re-downloads the same bytes.
- The fetch phase is **silent**. IntegrationHeader shows a `Loader2` spinner with "Loading…" text inside a small button. There is no prominent progress indicator, no per-stage feedback, and no sense of "we are on step 1 of 3." The spec panels remain empty during the wait, reinforcing the feeling that the app is frozen.

Two problems, one ADR:

1. **No caching.** Every fetch is uncached. Quota-aware persistent caching would collapse repeat-fetch latency to near-zero.
2. **No progress surface.** The in-flight state is invisible to users scanning the main viewport.

## Decision

### 1. Persistent spec cache (`src/lib/spec-cache.js`)
Backed by `localStorage` with a quota guard:

- Key shape: `apidiff:spec:<sha1(url)>`
- Entry: `{ url, fetched_at, expires_at, content, size_bytes }`
- TTL: 24 hours default (configurable via constant `SPEC_CACHE_TTL_MS`)
- Size guard: skip cache for entries > 3.5 MB (localStorage quota is typically 5 MB per origin)
- LRU-ish eviction: on quota exceeded, walk all `apidiff:spec:*` keys, sort by `fetched_at` ascending, drop oldest until the new entry fits
- Invalidation: `purge()` helper clears all `apidiff:spec:*` keys; surfaced in Settings as "Clear spec cache"

**Why localStorage, not IndexedDB?** Specs are string (JSON/YAML), not binary; localStorage is synchronous which simplifies the hot path; 5MB ceiling is adequate for most providers; fallback is graceful (re-fetch on miss). If we later need >5MB specs, swap to IDB behind the same API (no call-site changes).

### 2. Fetch wrapper with progress callback (`src/lib/fetch-spec.js`)
Thin wrapper around `base44.functions.invoke('proxyFetch', ...)`:

```
fetchSpec(url, { onProgress, signal }) -> Promise<string>
```

- Emit `onProgress({ stage: 'cache-lookup' })` before cache check
- Emit `onProgress({ stage: 'cache-hit' })` and resolve immediately on hit
- On miss: emit `{ stage: 'fetching', url }` → invoke proxyFetch → `{ stage: 'parsing' }` → `{ stage: 'caching' }` → resolve
- On error: reject with typed `SpecFetchError` carrying `{ url, phase }`

Single choke-point for both IntegrationHeader.handleCompare (dual fetch) and SpecInput URL-mode (single fetch).

### 3. Prominent progress surface (`src/components/diff/FetchProgress.jsx`)
A sticky banner that slides in below the app header during active fetch:

- Full-width bar with provider-color gradient fill
- Stage label row: `Fetching v1 → Fetching v2 → Resolving $refs → Computing diff → Done`
- Per-stage state: pending (grey), in-progress (pulsing, colored), complete (checkmark), error (red with message)
- Cache hits render as a quick-flash "Loaded from cache" pill for ~600ms then dismiss

Surface rendered in `DiffViewer.jsx` above the scroll zone so users in either pane see it.

### 4. Multi-stage orchestrator
`IntegrationHeader.handleCompare` switches from `Promise.all([fetch v1, fetch v2])` to a sequential pipeline that reports per-stage progress. Sequential-not-parallel is intentional: the UI becomes legible and browser connections aren't starved. Parallel can be a later optimization gated on a toggle.

## Scope
Primary adapter only. Cache is a browser-local concern; no domain/port change. If a future server-side cache becomes desirable, it can compose on top via a cache-port abstraction — out of scope here.

## Consequences

### Positive
- **Repeat-fetch latency collapses.** Cached specs load in <5ms vs. 1-6s uncached. Users comparing v1→v2 then v1→v3 only wait for v3.
- **Perceived performance up even on cold fetches.** A visible progress bar with stage labels makes the wait legible. "Fetching v2" is less frustrating than "…".
- **Debuggability.** Fetch errors now carry `{ url, phase }` so surfaced error banners can point to the exact failing step.

### Negative
- **localStorage quota pressure.** 3.5MB/entry limit caps the cache for giant specs. Mitigated by size guard + LRU eviction + skip-cache behavior. No functional regression — just no speedup for oversized specs.
- **Stale cache risk.** 24h TTL could serve stale bytes if a provider re-publishes a version under the same URL. Mitigated by the "Clear spec cache" Settings affordance and a 24h ceiling.

### Neutral
- Sequential fetch ordering trades a theoretical ~50% parallel speedup for legible progress reporting. Re-evaluatable if user data shows the serial wait is dominant.

## Alternatives Considered

**1. HTTP caching via `Cache-Control` headers on the proxy.**
Rejected. We don't control the upstream response headers, and the proxy would need to synthesize ETags. Client-side cache is simpler and invalidation-safe.

**2. IndexedDB for unbounded cache.**
Deferred. Async API ripple-cost and DX overhead isn't worth it until localStorage actually proves insufficient.

**3. Skip progress bar, rely on existing button spinner.**
Rejected — this is exactly the "UI feels frozen" complaint we're fixing.

**4. Service Worker for true HTTP caching.**
Rejected. SW adds deployment complexity and obscures the cache layer. Explicit cache module is easier to reason about and to clear.

## Implementation Plan
See `docs/workplans/wp-adr-018-spec-caching-and-progress.json`.

## References
- ADR-014/017 — design tokens and version-centric IA
- src/components/diff/IntegrationHeader.jsx — `handleCompare` fetch site
- src/components/diff/SpecInput.jsx — `urlLoad` fetch site
- base44 proxyFetch — upstream fetch primitive
