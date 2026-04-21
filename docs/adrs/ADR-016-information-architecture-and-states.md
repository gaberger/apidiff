# ADR-016: Information Architecture, Empty / Loading / Error States

## Status
Proposed

## Date
2026-04-14

## Authors
Gary Berger

## Context
Even with ADR-014 (tokens) and ADR-015 (component adoption), the app still reads primitive because of **information-architecture gaps** that no token or component swap fixes:

- **First-run is blank.** A user landing with no spec loaded sees an empty editor pane and a sidebar of provider logos — no guidance on what to do next.
- **Loading states are invisible.** Fetching a spec over HTTP (`SpecInput.jsx`) shows no progress — the UI freezes until the fetch resolves.
- **Errors are dumped.** HTTP/parse errors surface as `alert()` or raw text. No retry affordance, no "what do I do now."
- **Diff results with 0 items look identical to "not yet diffed."** Both show empty table.
- **No progressive disclosure.** Rename detection, response diff, guide timeline — all dense surfaces shown at full density from frame 1.
- **No keyboard discoverability.** Shortcuts exist implicitly (browser defaults) but nothing communicates them.

These are UX-shape problems, not theming problems. Solving them is where "primitive → polished" actually happens.

## Decision

Ship four information-architecture improvements as separate workplans:

### 1. First-run / empty-state scaffold
Add `<EmptyState>`, `<LoadingState>`, `<ErrorState>` wrappers in `src/components/ui/states/`. Each takes `{ title, description, actions, icon }` and renders consistently with ADR-014 tokens.

Wire into:
- `SpecInput.jsx` — empty editor shows "Drop a spec, paste a URL, or pick a provider →"
- `DiffResults.jsx` — empty results differentiate "no diff computed yet" vs "specs are identical"
- `MigrationGuide.jsx` — empty guide shows "Compute a diff to generate migration steps"
- `ProviderSidebar.jsx` — empty provider list shows "Add a registry provider in Settings"

### 2. Async state surfacing
Introduce a `useAsyncState()` hook that wraps promise-returning operations and exposes `{ status: 'idle'|'loading'|'success'|'error', data, error }`. Consumers render via the state wrappers.

Apply to:
- Spec URL fetch (with determinate progress when `Content-Length` known, indeterminate skeleton otherwise).
- Provider discovery (`discoverApi` use case dispatch).
- Diff computation (even though client-side, show skeleton if >100ms).

### 3. Keyboard shortcut surfacing
- Add `?` global shortcut → opens `<Dialog>` listing all shortcuts (grouped: Navigation / Diff / Editor / Settings).
- Add `⌘K` command palette (see ADR-015).
- Each button that has a shortcut shows it in its tooltip (e.g. `Run diff  ⌘↵`).

### 4. Progressive disclosure on dense surfaces
- Diff table: collapse `added`/`removed`/`modified` groups with counts; click to expand.
- Migration guide: show timeline only by default; "View checklist" expands full task list.
- Rename detection: fold behind a "Renames (N)" pill that expands on click.

## Consequences

### Positive
- **Every screen has a reason to exist,** even empty ones. Empty states become onboarding surfaces, not dead screens.
- **Errors are actionable.** `<ErrorState>` forces the author to think about "what's the recovery affordance" instead of `toast.error(e.message)`.
- **Perceived performance up.** Skeletons make the app feel faster even when bytes-in-flight are identical.
- **Keyboard parity.** `?` overlay makes shortcuts learnable — dev-tool table stakes.

### Negative
- Four workplans is more net work than the other ADRs. Mitigated: empty-state and async-state wrappers are foundational and each subsequent feature gets shorter.
- Adds a small hook (`useAsyncState`) that is not strictly necessary — could use `@tanstack/react-query` (already installed) for server async. Decision: use `react-query` for network calls, `useAsyncState` only for non-network async (parse, diff compute). Prevents bloat.

### Neutral
- Progressive disclosure is a preference; some users want everything open. Add a `data-density` integration (ADR-014) so "compact + collapsed" and "comfortable + expanded" are the two default presets.

## Alternatives Considered

**1. Route-level skeleton routes (React Router `loader` + `defer`).**
Rejected for now — our data-loading surface is small. Revisit if we grow multi-page async dependencies.

**2. Build empty states as page-specific markup.**
Rejected. Each page invents its own empty-state vocabulary; inconsistency is exactly the "primitive" smell we're removing.

**3. Drop keyboard shortcut surfacing (leave them implicit).**
Rejected. Invisible shortcuts = no shortcuts. The `?` overlay is ~50 LoC and dramatically changes perceived depth.

## Sequencing
1. ADR-014 (tokens) + ADR-015 (shadcn adoption) land first — this ADR builds on both.
2. This ADR's workplans dispatch: `state-wrappers` → `async-state-hook` → `keyboard-help` → `progressive-disclosure`.

## Implementation Plan
See `docs/workplans/wp-adr-016-ia-and-states.json` (enqueued via `hex brain`).

## References
- ADR-014 — Design system refinement
- ADR-015 — shadcn component adoption
- Refactoring UI (Adam Wathan, Steve Schoger) — empty-state patterns
- `src/pages/DiffViewer.jsx` — primary surface needing IA work
