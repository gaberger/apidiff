# Fix: integration-data-loading root cause (2026-04-22)

## Confirmed root cause
`src/components/diff/IntegrationHeader.jsx:252` — the two-version release-notes
branch of `handleCompare` passes literal empty objects `{}, {}` as the
before/after specs to `onLoadSpecs`. Editors render whatever `onLoadSpecs`
forwards, so they display blank. The *single-version* branch at
`IntegrationHeader.jsx:261` correctly calls `synthesizeSpecFromReleaseNotes`
to produce a real spec object; the two-version branch was overlooked.

## Compounding issues (tracked as follow-ups in this workplan)
- Clicking a version dot only updates state; user must also click the
  "Diff Release Notes" button to trigger the fetch. UX discoverability —
  covered in wp-ux-review-2026-04-22 step-6.
- `versionHasSpecs()` (IntegrationHeader.jsx:195-200) gates on a
  version-number heuristic (`>= 25.10`) rather than real URL availability.
- `STATIC_INTEGRATIONS` in IntegrationList.jsx:152-161 bypasses the
  `kind:docusaurus` registry entry for Forward Networks — the docusaurus
  discovery adapter is never invoked on click.
- `src/data/fwdnetworks.json` versions have no `url` field; every URL is
  synthesized at click time from a hardcoded pattern that returns 404 for
  most versions.

## Fix applied
`IntegrationHeader.jsx:246-262` — replaced `onLoadSpecs({}, {}, ...)` with
`onLoadSpecs(synthesizeSpecFromReleaseNotes(v1, null), synthesizeSpecFromReleaseNotes(v2, v1), ...)`.
Same synthesis helper the single-version path already uses.
