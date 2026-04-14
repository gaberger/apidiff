# ADR-015: shadcn/ui Component Adoption Pass

## Status
Proposed

## Date
2026-04-14

## Context
`package.json` includes the full Radix primitive set and `src/components/ui/` holds shadcn-generated components, but the application pages only use a narrow subset. Several UI surfaces use hand-rolled markup where a shadcn component would be stronger:

- **Provider sidebar** (`src/components/sidebar/ProviderSidebar.jsx`) — hand-rolled collapsible rows. shadcn `<Accordion>` + `<ScrollArea>` would give keyboard navigation, proper ARIA, and smooth expand animation for free.
- **Diff summary chips** (`src/components/diff/DiffSummary.jsx`) — raw `<button>` with Tailwind. shadcn `<ToggleGroup>` gives single-source-of-truth selection state + keyboard roving tabindex.
- **Spec input** (`src/components/diff/SpecInput.jsx`) — tabs between file/URL/paste modes are ad-hoc. shadcn `<Tabs>` is already installed (`@radix-ui/react-tabs`).
- **Settings pages** (`src/pages/settings/`) — forms use native inputs. shadcn `<Form>` + `<Input>` + `<Label>` give consistent validation affordances.
- **Toasts** — mix of `sonner` and ad-hoc alert divs. Pick one (prefer `sonner`, already installed).
- **Empty / loading / error states** — scattered one-off markup. Introduce `<EmptyState>`, `<LoadingState>`, `<ErrorState>` wrapper components in `src/components/ui/states/`.
- **Command palette** — `cmdk` is installed but unused. Adding `⌘K` command palette unlocks power-user navigation across specs/providers/guide sections.

## Decision

Execute a **targeted adoption pass** across six surfaces, with one PR per surface to keep blast radius bounded.

### Surface → shadcn component map

| Surface | Current | Target |
|---|---|---|
| Provider sidebar | hand-rolled | `Accordion` + `ScrollArea` + `Tooltip` |
| Diff filter chips | `<button>` grid | `ToggleGroup` (multiple) |
| Spec input modes | ad-hoc tab bar | `Tabs` |
| Settings forms | native inputs | `Form` + `Input` + `Label` + `Select` |
| Toasts / alerts | mixed | `sonner` (single source) |
| Empty / loading / error | scattered | new `<State*>` wrappers (built on shadcn primitives) |
| Command palette | absent | `cmdk` + `Dialog` (`⌘K` to open) |

### Architectural boundary
All shadcn component usage stays inside the **primary adapter** (`src/components`, `src/pages`). No domain, port, or usecase code is touched. This preserves the ADR-001 boundary — shadcn is an implementation detail of the React adapter, invisible to the domain.

### Import discipline
- Components under `src/components/ui/` are the only allowed shadcn imports. No direct `@radix-ui/*` imports from feature components — always go through the `src/components/ui/` wrapper so variants and theme tokens stay centralized.
- All `.js` extension rules from CLAUDE.md still apply to our source; shadcn-generated files keep their existing import style.

## Consequences

### Positive
- **Accessibility for free.** Every swap moves from hand-rolled ARIA to Radix-managed focus/keyboard/screen-reader behavior.
- **Consistency.** One Tabs component, one Toast surface, one empty-state pattern.
- **Power-user surface.** `⌘K` palette makes the app feel "real" — typical affordance bar for dev tools.

### Negative
- Seven discrete component-swap PRs. Each is small but they add up. Mitigated by one-surface-per-PR scope (reviewable in <10 min each).
- Some visual regressions possible where hand-rolled styling diverged from shadcn defaults. The ADR-014 token pass happens first so shadcn components land on the refined tokens, not the defaults.

### Neutral
- `framer-motion` stays available for bespoke animation but is not a default — shadcn+`tailwindcss-animate` covers most transitions.

## Sequencing
1. **ADR-014 lands first** (tokens). Any shadcn components adopted before the token pass would need to be re-touched.
2. Then this ADR's workplans dispatch in order: sidebar → chips → tabs → forms → toasts → states → palette.
3. Each PR runs `bun run typecheck` + `bun run lint` + `hex analyze .` — no boundary violations tolerated.

## Alternatives Considered

**1. "Big-bang" rewrite of all primary adapter components.**
Rejected. High regression risk, no way to roll back a single surface.

**2. Keep hand-rolled components, theme them better.**
Rejected. ADR-014 tokens address theming, but hand-rolled components still lack the accessibility and keyboard behavior Radix gives us.

**3. Adopt a different component library's command palette (kbar, etc.).**
Rejected. `cmdk` is already in `package.json` and is the shadcn-standard choice.

## Implementation Plan
See `docs/workplans/wp-adr-015-shadcn-adoption.json` (enqueued via `hex brain`).

## References
- ADR-012 — Vite + React primary adapter
- ADR-014 — Design system refinement (prerequisite)
- `src/components/ui/` — existing shadcn components
- shadcn/ui docs — https://ui.shadcn.com
