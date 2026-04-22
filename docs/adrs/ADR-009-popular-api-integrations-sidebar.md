# ADR-009: Popular API Integrations with Left Navigation Sidebar

## Status
Accepted

## Date
2026-04-08

## Authors
Gary Berger

## Context
Users currently load API comparisons by pasting raw JSON or selecting from a small dropdown of generic samples. Real-world API migration work targets specific providers — Stripe, HubSpot, Twilio, GitHub, Shopify, Slack — each with well-documented version histories and publicly available OpenAPI specs.

Providing curated, real-world API response samples organized by provider would:
1. Eliminate manual JSON sourcing for the most common migration scenarios
2. Demonstrate apidiff's value immediately with realistic data
3. Educate users about actual breaking changes in APIs they use

## Decision

### 1. Integration Registry
Maintain a static registry of popular API providers with curated version-pair samples. Each integration entry contains:

| Field | Description |
|-------|-------------|
| `id` | Unique slug (`stripe`, `hubspot`, etc.) |
| `name` | Display name |
| `icon` | SVG path data for the provider logo |
| `color` | Brand accent color |
| `specUrl` | Link to public OpenAPI spec repo (informational) |
| `versions` | Array of version-pair comparisons |

### 2. Supported Providers (Initial Set)

| Provider | Versions | OpenAPI Spec Source | Key Breaking Changes |
|----------|----------|--------------------|--------------------|
| **Stripe** | 2023-10-16 → 2025-12-18 | github.com/stripe/openapi | `billing` → `collection_method`, `sources` → `payment_methods` |
| **HubSpot** | v2 → v3 (CRM) | github.com/HubSpot/HubSpot-public-api-spec-collection | Contact properties restructured, associations API rewrite |
| **Twilio** | 2010-04-01 (Message v1 → v2) | github.com/twilio/twilio-oai | `price` string → object, `sid` → `message_sid` |
| **GitHub** | REST 2022-11-28 → 2024-11-25 | github.com/github/rest-api-description | `gravatar_id` removed, `node_id` added |
| **Shopify** | Admin 2024-10 → 2025-04 | shopify.dev/docs/api | Product variant restructuring |
| **Slack** | Web API v1 → v2 (conversations) | github.com/slackapi/slack-api-specs | `channels.*` → `conversations.*` migration |

### 3. Left Navigation Sidebar
Replace the current top-bar sample dropdown with a collapsible left sidebar:

- **Width**: 260px fixed, collapsible to icon-only (48px) on small screens
- **Structure**: Provider groups with expandable version pairs underneath
- **Behavior**: Clicking a version pair loads both JSON samples into editors and auto-runs the diff
- **Visual**: Provider icon + name with brand color accent on the left border
- **State**: Selected integration is highlighted; sidebar scroll is independent from main content

### 4. Layout Change
The page layout shifts from single-column to sidebar + main:

```
┌──────────┬─────────────────────────────┐
│ SIDEBAR  │  HEADER (top bar)           │
│          ├─────────────────────────────┤
│ Stripe   │                             │
│  v1→v2   │  MAIN CONTENT              │
│ HubSpot  │  (editors, diff table,     │
│  v2→v3   │   guide, etc.)             │
│ Twilio   │                             │
│  v1→v2   │                             │
│ GitHub   │                             │
│  v3→v4   │                             │
│ Shopify  │                             │
│  24→25   │                             │
│ Slack    │                             │
│  v1→v2   │                             │
└──────────┴─────────────────────────────┘
```

### Constraints
- Sidebar is rendered entirely with `document.createElement()` + `textContent` (ADR-004)
- SVG icons are inline path data, not fetched URLs (no external requests on load)
- The integration registry is a static JS object in the HTML — no additional API endpoint needed
- The existing `/api/samples` endpoint and dropdown remain functional as a fallback
- Sidebar collapses on viewports < 768px to preserve mobile usability

## Consequences
- Users can immediately compare real API version changes without sourcing JSON
- The sidebar provides professional, app-like navigation familiar from tools like Postman or Insomnia
- Adding new providers requires only adding an entry to the registry object — no backend changes
- The layout shift from single-column to sidebar+main is a visual breaking change for existing users
- SVG icon data increases the HTML payload by ~2-3KB (acceptable for 6 providers)

## Amendments

### 2026-04-22 — Replaced `ProviderSidebar.jsx` with `IntegrationList.jsx`

The original React component (`src/components/sidebar/ProviderSidebar.jsx`, 222 LOC) was removed in favor of `src/components/sidebar/IntegrationList.jsx`, which consumes the domain-layer provider registry directly and integrates with the Docusaurus discovery adapter added for ADR-008 / spec-input expansion. The sidebar decision itself — curated provider registry, left-nav layout, version-pair click-to-load — is unchanged. The replacement was a component-level refactor, not a reversal of this ADR.

Concurrent change to `src/lib/domain/provider-registry.js`: Forward Networks switched from a hardcoded 13-URL `specUrls` array to `{ kind: "docusaurus", baseUrl: "https://docs.fwd.app" }` + `changelogUrl`. This is a data-shape change within the same registry; adapters (`docusaurus-discovery-adapter.ts`) fan out the concrete URLs at runtime.
