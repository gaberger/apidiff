# ADR-014: Design System Refinement — Tokens, Elevation, Motion, Density

## Status
Accepted

## Date
2026-04-14

## Authors
Gary Berger

## Context
The React UI (ADR-012, ADR-013) is functionally complete but visually flat. Shadcn primitives, Tailwind, `tailwindcss-animate`, `framer-motion`, and a full HSL token palette in `src/index.css` are already wired — but the pages under `src/pages/` and `src/components/diff,sidebar,guide` use a narrow slice of the design language:

- Cards render as flat borders with no elevation hierarchy (no shadow scale, no backdrop blur).
- Spacing is ad-hoc (`gap-2` vs `gap-3` vs `gap-4` used interchangeably for the same visual role).
- Motion is absent on state transitions (filter chip toggles, panel opens, diff row reveals).
- Typography uses a single weight/size for headings vs. metadata — no rhythm.
- Dark mode tokens exist (`src/index.css`) but the gate is not surfaced in the UI (see also ADR-015 companion work).
- Density is uniform — list-heavy views (diff table, provider sidebar) would benefit from a compact variant.

The result reads as "unstyled shadcn" rather than a designed product.

## Decision

Adopt a **four-axis design system refinement**, driven by tokens only — no component rewrites in this ADR.

### 1. Elevation scale (shadow tokens)
Add `--elevation-{0..4}` tokens in `src/index.css` and expose them as Tailwind `shadow-e0..shadow-e4`. Map:
- `e0` — flat, no shadow (embedded controls)
- `e1` — resting card (default)
- `e2` — hover card / raised control
- `e3` — popover / dropdown
- `e4` — dialog / modal

Dark-mode variants use colored shadow (`hsl(var(--primary) / 0.15)`) rather than black.

### 2. Motion tokens
Add `--motion-{fast,base,slow}` durations and `--ease-{standard,emphasized,decel}` timing curves. Wire into `tailwind.config.js` `transitionDuration` and `transitionTimingFunction` so all components can use `duration-fast ease-standard` consistently.

Standard motion vocabulary:
- `fast (120ms)` — hover, focus, chip toggle
- `base (220ms)` — panel expand/collapse, sidebar
- `slow (360ms)` — page transitions, list reveal

### 3. Density scale
Introduce a `data-density="compact|comfortable"` attribute on a root container. Tailwind variants:
```css
[data-density="compact"] .dsy-row { @apply py-1.5 text-sm; }
[data-density="comfortable"] .dsy-row { @apply py-3 text-base; }
```
Diff table + provider sidebar adopt `.dsy-row` class so users can toggle density. Default remains `comfortable`.

### 4. Typography rhythm
Redefine heading classes via `@layer components` in `src/index.css`:
- `.t-display` — 30/36, weight 700, tracking -0.02em
- `.t-h1` — 24/32, weight 600
- `.t-h2` — 18/28, weight 600
- `.t-body` — 14/22, weight 400
- `.t-meta` — 12/16, weight 500, uppercase, tracking 0.06em, `text-muted-foreground`

Pages stop using raw `text-lg font-semibold`-style Tailwind stacks for headings; they use semantic classes.

## Consequences

### Positive
- **Single source of visual truth.** Swapping elevation scale or motion speed is a 3-line change in `index.css` + `tailwind.config.js` rather than hunting through 40 components.
- **Dark-mode rigor.** All elevation/motion tokens have dark variants defined once.
- **No architectural impact.** Tokens live in the primary adapter's CSS; the hexagonal boundary is untouched.

### Negative
- One-time sweep through existing components to replace ad-hoc shadows/spacings with tokens. Scoped to `src/components/{diff,sidebar,guide}` and `src/pages/`.
- Adds ~30 LoC to `index.css` and ~15 to `tailwind.config.js`. Acceptable for the leverage gained.

### Neutral
- shadcn component library itself is not modified — this is a theming layer on top.

## Alternatives Considered

**1. Swap to a different component library (Mantine, Chakra, etc.)**
Rejected. shadcn is already wired, owns its source code in `src/components/ui`, and has no runtime theming lock-in. Switching would be pure churn.

**2. Inline Tailwind @apply pruning only.**
Rejected. Solves consistency but not the elevation/motion/density gaps.

**3. Ship a "v2 redesign" ADR rewriting all pages.**
Rejected. Token refinement first lets us judge how much visual lift we actually need before any component rewrite.

## Implementation Plan
See `docs/workplans/wp-adr-014-design-tokens.json` (enqueued via `hex brain`).

## References
- ADR-012 — Vite + React primary adapter
- ADR-013 — React feature parity implementation
- `src/index.css` — current token definitions
- `tailwind.config.js` — current Tailwind theme extensions

## Amendments

### 2026-04-22 — Status flip: proposed → accepted

Core decision is live: framer-motion integrated across `MigrationGuide.jsx`, `IntegrationList.jsx`, `DiffSummary.jsx`, `EmptyState.jsx`, `DiffViewer.jsx`; token system in `src/index.css`. Residual work — converting 8 remaining bare `stone-*` class uses to semantic shadcn tokens — is tracked in `docs/workplans/wp-ux-dark-mode-residual-tokenization.json` (status: pending). Accepting the ADR does not imply rollout complete; it acknowledges the decision is load-bearing in current code.
