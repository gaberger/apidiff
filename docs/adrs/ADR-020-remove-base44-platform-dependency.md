# ADR-020 — Remove base44 platform dependency

## Status
Accepted — 2026-04-20

## Context
The web shell was originally scaffolded as a base44 app. That created four hard
couplings to the base44 SDK:

| Surface | Files | base44 API |
|---|---|---|
| Integration persistence | `src/pages/Settings.jsx`, `src/components/sidebar/IntegrationList.jsx` | `base44.entities.Integration.{list,create,update,delete}` |
| URL proxy (CORS bypass) | `src/lib/fetch-spec.js`, `src/components/sidebar/VersionPicker.jsx`, `src/components/diff/SpecInput.jsx` | `base44.functions.invoke("proxyFetch", { url })` |
| Discovery | `src/components/settings/DiscoveryPanel.jsx` | `base44.functions.invoke("discoverApi", …)` |
| Auth | `src/lib/AuthContext.jsx`, `src/lib/PageNotFound.jsx`, `src/components/UserNotRegisteredError.jsx` | `base44.auth.me / logout / redirectToLogin` |

All four surfaces import `@/api/base44Client` directly from the React layer —
an architectural leak the hex analyzer does not catch because React is `.jsx`
and sits outside the `src/core|ports|adapters` graph it scans.

Separately, ADR-019 committed to a server-side `diffSpecs` base44 function as a
faster path than the client-side oasdiff pipeline. That plan is also impacted.

## Decision
Remove the base44 SDK entirely. Replace each surface with a hex-compliant port
+ adapter pair, consumed by the React layer through a small React bridge
(hook/context) so the UI never imports a secondary adapter directly.

### Replacement map

| Base44 surface | Replacement |
|---|---|
| `entities.Integration.*` | New `IntegrationStoragePort` (core/ports) + `LocalStorageIntegrationAdapter` (adapters/secondary). React components consume via a `useIntegrationStore` hook that resolves through the composition root. |
| `functions.invoke("proxyFetch")` | New `SpecProxyPort`. Primary implementation: Vercel Function (`api/proxy-fetch.ts`) that round-trips the URL server-side. Browser adapter also attempts direct `fetch()` first and only falls back to the proxy when CORS denies. |
| `functions.invoke("discoverApi")` | Existing `src/adapters/secondary/*-discovery-adapter.ts` wired through the composition root and exposed via a `DiscoveryPort`. |
| `auth.*` | Remove. App is single-tenant client-side; `requiresAuth: false` was already configured. `AuthContext`, `UserNotRegisteredError`, and the admin-branch in `PageNotFound` are deleted. |

### Architecture rule extension
This ADR extends the hex rules to cover the React surface: **React components
may not import from `src/api/*`, `src/adapters/*`, or any third-party SDK that
represents infrastructure. They consume ports exclusively through a
composition-root-provided bridge.** The analyzer will be taught this rule in a
follow-up (see workplan `feat-remove-base44`, step 5).

## Consequences
### Positive
- Closes the React-to-infrastructure leak flagged in the 2026-04-20 audit.
- Drops the `@base44/sdk` dependency + related axios-client import.
- Removes dead auth surface (`requiresAuth: false` made it decorative).
- Collapses `src/lib/app-params.js` and `VITE_BASE44_API_KEY` env var.
- Enables offline-first Integration persistence (localStorage).

### Negative
- Integrations become per-browser; cross-device sync requires a follow-up
  port + adapter (deferred).
- `proxyFetch` is replaced by a Vercel Function we own — one more serverless
  surface to maintain.

### Neutral / affects other ADRs
- **Supersedes the base44-function dependency in ADR-019.** The server-side
  `diffSpecs` path will be re-hosted as a Vercel Function. The ADR-019
  decision (server-side oasdiff is the fast path) remains valid; only the
  hosting substrate changes.

## Implementation
Tracked by workplan `docs/workplans/feat-remove-base44.json`, decomposed into
four slices plus an analyzer extension:

1. Strip auth surface (smallest, no downstream deps) — in-session.
2. IntegrationStoragePort + LocalStorageIntegrationAdapter + React bridge.
3. SpecProxyPort + Vercel Function + browser fallback.
4. DiscoveryPort wiring through existing secondary adapters.
5. Teach `hex analyze` that React (`**/*.jsx,tsx`) must not import
   `@/api/*` or `src/adapters/*`.

## Rollback
If a hosted Integration store is needed later, add a second
`IntegrationStoragePort` adapter (e.g. `SupabaseIntegrationAdapter`) and swap
the composition-root wiring. Port contract stays stable.
