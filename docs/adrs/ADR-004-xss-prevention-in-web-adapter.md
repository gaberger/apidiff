# ADR-004: XSS Prevention in Web Adapter

## Status
Accepted

## Date
2026-04-08

## Authors
Gary Berger

## Context
The web UI renders user-pasted JSON values in a diff table. These values originate entirely from user input (external to the domain layer). Using `innerHTML` to render them would create a direct XSS vector — a malicious JSON value like `"<img onerror=alert(1) src=x>"` would execute arbitrary JavaScript.

## Decision
The web adapter MUST NOT use `innerHTML`, `outerHTML`, or `insertAdjacentHTML` with any data that originates outside the domain layer. All dynamic content rendering uses safe DOM APIs:

- `document.createElement()` for structure
- `element.textContent` for values
- `element.className` for styling

This is enforced by the project's CLAUDE.md security rule and validated by pre-commit hooks.

## Consequences
- XSS attacks via malicious JSON values are structurally impossible
- Rendering code is slightly more verbose than template literals + innerHTML
- No dependency on a sanitizer library (DOMPurify etc.) — the attack surface is eliminated, not mitigated
- Same approach must be maintained for any future dynamic content rendering in the web adapter
