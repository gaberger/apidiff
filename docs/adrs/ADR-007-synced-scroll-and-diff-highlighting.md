# ADR-007: Synchronized Scroll and Diff-Aware Syntax Highlighting

## Status
Accepted

## Date
2026-04-08

## Authors
Gary Berger

## Context
The web adapter displays two side-by-side JSON editors ("Old Response" / "New Response"). Currently:

1. **Each textarea scrolls independently.** When comparing large payloads, users lose visual alignment between corresponding fields. The pencil design spec shows a single shared scrollbar controlling both panes simultaneously.

2. **Editor content is plain monospace text.** After running a diff, users must mentally cross-reference the results table with the raw JSON to locate changes. There is no visual indicator inside the editors showing which lines were added, removed, renamed, moved, or type-changed.

Both features require careful design because:
- The editors render user-supplied JSON (external data), so ADR-004 (XSS prevention) prohibits `innerHTML`/`outerHTML`/`insertAdjacentHTML`.
- Syntax highlighting over a plain `<textarea>` is not natively possible — textareas cannot render mixed colors. An overlay or replacement strategy is needed.

## Decision

### 1. Synchronized Scrolling
The two editor panes MUST scroll in lockstep via a single logical scroll position:

- Replace the two independent `<textarea>` elements with scrollable `<div>` containers, each wrapping a read-write content area.
- Attach a `scroll` event listener to each pane. When one pane scrolls, programmatically set `scrollTop` on the sibling pane to the same value.
- Use a guard flag (`isSyncing`) to prevent infinite scroll-event recursion.
- Optionally render a single visible scrollbar track (as shown in the pencil design) while hiding native scrollbars via CSS (`scrollbar-width: none` / `::-webkit-scrollbar { display: none }`).

### 2. Diff-Aware Syntax Highlighting
After a diff operation completes, the editor panes MUST visually highlight lines affected by detected changes:

- Parse the JSON content into lines and build a line-to-path mapping by tracking brace/bracket nesting and key positions.
- Cross-reference each line's JSON path against the `DiffResult[]` returned by the domain layer.
- Render each line as a separate `<span>` element inside the scrollable container, using `textContent` (never `innerHTML`) to set the line text. Apply CSS classes for change types:
  - `.line-removed` — red background tint (matches `--red-bg`)
  - `.line-added` — green background tint (matches `--green-bg`)
  - `.line-renamed` — blue background tint (matches `--blue-bg`)
  - `.line-type-change` — amber background tint (matches `--amber-bg`)
  - `.line-moved` — purple background tint (matches `--purple-bg`)
- When no diff results exist (before first comparison), render all lines with default styling.
- Line highlighting is purely decorative — it MUST NOT alter the underlying JSON data or interfere with copy/paste of editor content.

### Constraints
- All dynamic content rendering MUST use `document.createElement()` + `textContent` per ADR-004.
- The editor content MUST remain editable (either via `contentEditable` on a `<div>` or by layering a transparent `<textarea>` over the highlighted overlay).
- Synchronized scroll MUST work bidirectionally — scrolling either pane updates the other.
- Highlighting MUST be triggered automatically when a sample is selected (the select dropdown populates both editors and immediately runs the diff), as well as when the user clicks "Compare" manually. Highlights are cleared when editor content changes without a subsequent diff.

## Consequences
- Users can visually track corresponding lines across old/new payloads without manual scrolling alignment
- Changed fields are immediately visible in the editors, reducing cognitive load when reviewing large API responses
- The overlay/span-based rendering is more complex than plain textareas, but remains XSS-safe by construction
- Editor performance may degrade for very large JSON payloads (thousands of lines) due to per-line DOM elements — a virtualized renderer could be added later if needed
- The line-to-path mapping is a heuristic based on JSON formatting; it works reliably on pretty-printed JSON but may be less precise on minified input (auto-formatting on paste is recommended)
