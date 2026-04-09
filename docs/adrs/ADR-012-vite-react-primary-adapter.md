# ADR-012: Vite + React as Primary Web Adapter

## Status
Proposed

## Date
2026-04-09

## Context

The project currently has two UI implementations:

1. **`src/adapters/primary/static/index.html`** — Hand-crafted vanilla JS served by `Bun.serve()`. Functional but hard to maintain: 700+ lines of inline JS, no component model, manual DOM manipulation.

2. **`frontend/`** — React/Vite/Tailwind app with shadcn/ui components (merged from apidiff-1). Has a polished component structure (DiffItem, DiffResults, DiffSummary, SpecInput) but uses an **LLM API call** for diffing instead of our deterministic domain algorithm.

Neither is ideal alone:
- The vanilla HTML has the correct backend wiring but poor UI scalability
- The React app has beautiful components but uses an LLM instead of our proven diff engine

### Why migrate to Vite

| Concern | Current (Bun.serve + inline HTML) | Target (Vite + React) |
|---------|----------------------------------|----------------------|
| Component model | None — manual `createElement` | React components with props/state |
| Styling | 250 lines inline CSS | Tailwind + shadcn/ui design system |
| Dev experience | Full server restart on changes | Vite HMR (instant updates) |
| Build optimization | None | Tree-shaking, code splitting, minification |
| Testing | No UI tests possible | React Testing Library, Vitest |
| Accessibility | Manual ARIA | shadcn/ui built-in a11y |
| ADR-004 (XSS) | Manual textContent discipline | React's default JSX escaping |

## Decision

### 1. Architecture: Vite dev server proxies to Bun API server

```
┌─────────────────────────────────────────────────────┐
│                    Browser                           │
│                                                      │
│  localhost:5173 (Vite)                               │
│    ├── React UI (HMR)                                │
│    └── /api/* ──proxy──→ localhost:4747 (Bun)        │
│                            ├── POST /api/diff        │
│                            ├── POST /api/guide       │
│                            ├── POST /api/fetch-spec  │
│                            ├── GET  /api/providers   │
│                            └── GET  /api/samples     │
└─────────────────────────────────────────────────────┘
```

In development, Vite runs on `:5173` with HMR and proxies `/api/*` to the Bun backend on `:4747`. In production, Vite builds static assets that the Bun server serves from `dist/`.

### 2. Move frontend/ to project root

The React app moves from `frontend/` to the project root, coexisting with `src/` (the hexagonal backend):

```
/
├── src/                         # Hexagonal backend (unchanged)
│   ├── core/domain/
│   ├── core/ports/
│   ├── core/usecases/
│   ├── adapters/primary/        # Bun API server (keeps serving /api/*)
│   ├── adapters/secondary/
│   └── composition-root.ts
├── app/                         # React frontend (moved from frontend/src/)
│   ├── components/
│   │   ├── ui/                  # shadcn/ui primitives
│   │   └── diff/                # DiffResults, DiffItem, SpecInput, etc.
│   ├── pages/
│   │   └── DiffViewer.tsx       # Main page (converted to TypeScript)
│   ├── hooks/
│   ├── lib/
│   ├── App.tsx
│   └── main.tsx
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json                # Shared TS config
├── tsconfig.app.json            # React-specific paths
├── tsconfig.node.json           # Backend-specific paths
└── index.html                   # Vite entry point
```

### 3. Replace LLM diffing with domain calls

The React frontend currently calls `base44.integrations.Core.InvokeLLM` to diff specs. Replace this with direct API calls to our backend:

```typescript
// Before (LLM-based, non-deterministic)
const res = await base44.integrations.Core.InvokeLLM({
  prompt: `Compare these specs...${before}...${after}`,
});

// After (domain-based, deterministic, Coq-verified)
const diffRes = await fetch("/api/diff", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ old: JSON.parse(before), new: JSON.parse(after) }),
});
const results = await diffRes.json();
```

### 4. Convert JSX to TSX

All React components convert from `.jsx` to `.tsx` with proper typing:

```typescript
// components/diff/DiffItem.tsx
interface DiffItemProps {
  result: DiffResult;  // imported from domain types
  onToggle: (path: string) => void;
}

export function DiffItem({ result, onToggle }: DiffItemProps) { ... }
```

Domain types (`DiffResult`, `MigrationGuide`, `ChangeType`, etc.) are imported directly from `src/core/domain/types.ts` — this is allowed because the frontend reads from the domain layer (same as ports do).

### 5. Vite configuration

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "app") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4747",
    },
  },
  build: {
    outDir: "dist/frontend",
  },
});
```

### 6. Production serving

The Bun server serves both the API and the built React assets:

```typescript
// Updated web-adapter.ts
if (url.pathname.startsWith("/api/")) {
  return this.handleApi(req, url);
}
// Serve Vite-built assets
return this.serveStatic(url.pathname);
```

### 7. Keep Base44 as hosting platform

Base44 is the runtime platform — `base44Client.js`, `AuthContext`, and `app-params` remain. The diff logic changes from LLM-based to our deterministic domain algorithm, but the call still routes through Base44's integration layer:

```typescript
// Replace LLM prompt-based diffing with a structured Base44 integration
// that calls our computeDiff domain function server-side
const res = await base44.integrations.Core.RunFunction({
  function: "computeDiff",
  params: { old: JSON.parse(before), new: JSON.parse(after) },
});
```

If Base44 supports custom server-side functions, we deploy our domain logic there. If not, the React app calls our Bun API server (proxied through Base44) and the Base44 client handles auth/session management around it.

## Consequences

- **Better DX**: Vite HMR means UI changes are instant — no server restarts
- **Type safety**: TSX components import domain types directly — breaking type changes caught at compile time
- **Deterministic diffing**: LLM call replaced with our Coq-verified algorithm
- **Scalable UI**: shadcn/ui provides 40+ accessible components out of the box
- **ADR-004 compliance simplified**: React's JSX escaping prevents XSS by default — no more manual `textContent` discipline
- **Two dev servers**: Development requires running both `bun run src/web.ts` and `vite dev` (can be combined with `concurrently`)
- **Build step**: Production now requires `vite build` before deployment
- **Larger dependency footprint**: React, Vite, Tailwind, shadcn/ui added to the project
- **Base44 compatibility**: Auth, session management, and deployment stay on Base44 — the diff engine is the only piece that changes from LLM to deterministic

## Alternatives Considered

### Keep vanilla HTML, improve with Web Components
Rejected: Web Components lack ecosystem (no shadcn equivalent), and the existing 700-line HTML is already at maintainability limits.

### Use Bun's built-in bundler for React
Considered: Bun can bundle React, but lacks Vite's HMR, plugin ecosystem, and proxy dev server. Vite is the React ecosystem standard.

### Server-side rendering (Next.js, Remix)
Rejected: This is a client-side tool, not a content site. SSR adds complexity with no benefit — all data comes from the local API server.
