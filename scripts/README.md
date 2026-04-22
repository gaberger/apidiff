# scripts/

Non-production tooling. None of these are imported by the app; they are run manually to generate or update provider data.

## Forward Networks provider pipeline

Re-run when Forward Networks publishes new release notes at `https://docs.fwd.app/release-notes/api`.

```
bun scripts/analyze-release-notes.js        # scrapes fwd.app → release-notes-diff.json
bun scripts/generate-fwd-provider.js > src/data/fwdnetworks.json
bun scripts/add-fwd-urls.js                 # adds `date` field for VersionTimeline
```

Dependencies: [`agent-browser`](https://github.com/vercel-labs/agent-browser) on PATH. Bun for execution.

## Other

- `sync-lib-domain.js` — copies `src/core/domain/` → `src/lib/domain/` (legacy bridge).
- `hex-statusline.cjs` — statusline renderer for hex terminal output.
