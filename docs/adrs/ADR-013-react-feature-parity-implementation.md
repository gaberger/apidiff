# ADR-013: React Feature Parity Implementation Notes

## Status
Accepted

## Date
2026-04-09

## Authors
Gary Berger

## Context
ADR-012 proposed migrating to Vite + React. During implementation, we discovered that the `apidiff-1` repo was Base44 boilerplate (LLM-based diffing), not our actual app. We needed to port the real vanilla HTML UI to React components that import our Coq-verified domain functions directly.

This ADR records the implementation decisions and patterns we used.

## Architecture: Client-Side Domain Functions

`computeDiff` and `buildGuide` are pure functions with zero I/O. Vite bundles them directly into the browser JS -- no server needed.

```
Browser -> import { computeDiff } from "@domain/diff-algorithm"
        -> import { buildGuide } from "@domain/guide-builder"
```

### Vite Path Aliases
- `@` -> `app/` (React components)
- `@domain` -> `src/core/domain/` (Domain functions)

## Component Architecture

```
app/
  api/apidiff-client.ts        # Re-exports domain functions + sample data
  components/
    diff/
      DiffSummary.jsx           # Clickable filter chips with counts
      DiffResults.jsx           # Table container with pagination (50 rows)
      DiffItem.jsx              # Table row with per-segment path clicking
      SpecInput.jsx             # Editor: syntax highlight, URL fetch, drop zone
      EditorOverlay.jsx         # Diff-aware line coloring overlay
    sidebar/ProviderSidebar.jsx # Collapsible provider list
    guide/MigrationGuide.jsx    # Timeline, progress, checklist, md export
  hooks/
    use-synced-scroll.js        # Proportional scroll sync between two refs
    use-diff-highlight.js       # Maps DiffResult paths to line numbers
  pages/DiffViewer.jsx          # Main page orchestrating all components
```

## Key Implementation Patterns

### 1. Syntax Highlighting (ADR-004 Safe, No Unsafe HTML)

Transparent textarea over a colored pre:
- `colorizeJsonLine()` returns React span elements with Tailwind classes
- Pre and textarea scroll synced via onScroll handler
- Colors: keys=purple-700, strings=green-700, numbers=blue-700, booleans=amber-700, null=stone-400

### 2. Diff-Aware Line Highlighting

`useDiffHighlight(jsonString, results)` returns `Map<lineNumber, {type, path}>`:
1. `buildLinePathMap()` walks JSON tracking nesting via stack
2. Cross-references with DiffResult[] (indexes both `r.path` and `r.newPath`)
3. `findMatch()` checks exact, walks UP parents, walks DOWN to child changes

**Critical**: Line numbers are 0-based everywhere. Original had off-by-one (`get(i+1)` vs `get(i)`) that broke right editor highlights.

### 3. Per-Segment Path Clicking

Each dot-separated segment is individually clickable:
- Left-side segments (old path): amber hover, scrolls left editor only
- Right-side segments (after arrow): green hover, scrolls right editor only
- `onPathClick(partialPath, "left"|"right")` -- each side independent

### 4. Independent Scroll on Path Click

`suppressSync()` disables synced scroll for 100ms before programmatic scrolling. Prevents sync handler from overriding independent scroll positions when old/new paths are at different line numbers.

### 5. Indentation-Based Path Traversal

`scrollToPath` finds paths in pretty-printed JSON using indent depth:
- Each segment must match at deeper indent than previous
- Works because `JSON.stringify(x, null, 2)` has monotonic indentation
- Line height: `textarea.scrollHeight / totalLines`

### 6. Flash Highlight

Target line gets 2s amber flash via `highlightLine` prop. Must be in `useMemo` deps array (was missing, caused stale renders).

### 7. Provider Sidebar with Auto-Compare

Click version pair -> populates editors -> runs `computeDiff()` immediately. Sample data (Stripe, Twilio, GitHub) bundled inline.

### 8. Migration Guide

Uses `buildGuide()` from domain. Timeline dots, gradient progress bar, severity-colored cards, localStorage checklist, tabbed code examples, Markdown export.

## Consequences

- All diff computation is client-side -- instant, no server latency
- Domain functions are Coq-verified and bundled unchanged into browser
- Deploys on Base44 with zero backend for core diffing
- Transparent-textarea-over-pre pattern requires exact font/line-height match
- All line references are 0-based throughout (documented to prevent future bugs)
