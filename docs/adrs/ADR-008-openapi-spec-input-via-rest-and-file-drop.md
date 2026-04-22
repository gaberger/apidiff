# ADR-008: OpenAPI Spec Input via REST API and File Drop

## Status
Accepted

## Date
2026-04-08

## Authors
Gary Berger

## Context
APIDIFF currently accepts raw JSON responses pasted into textareas. To compare full OpenAPI 2.0 and 3.0 specifications, users need two input methods:

1. **REST API fetch** — pull a live spec from a URL (e.g., `https://api.example.com/v2/openapi.json`)
2. **File drop** — drag-and-drop `.json` or `.yaml` spec files onto the web editor

Both methods must produce the same internal representation so the diff pipeline (flatten -> classify -> guide) works identically regardless of input source. Our Coq proofs (25 theorems in `proofs/`) verify the algorithm's correctness under OpenAPI structural constraints (`well_formed`, `bounded_depth`), so the input layer must guarantee those preconditions are met before data reaches the domain.

### Constraints
- The `SchemaFetchPort` (ADR-005) already handles URL-to-file resolution for the CLI path
- The web adapter must not violate ADR-004 (no `innerHTML` with external data)
- OpenAPI specs may be YAML — the input layer must normalize to JSON before diffing
- Specs can reference external files via `$ref` — these must be resolved before flattening
- The domain layer must remain pure — all I/O belongs in adapters

## Decision

### 1. New port: `SpecInputPort`

Define a port that abstracts spec acquisition, producing a validated, resolved OpenAPI document:

```typescript
interface SpecInputPort {
  fromUrl(url: string): Promise<ResolvedSpec>;
  fromFile(content: string, filename: string): Promise<ResolvedSpec>;
}

interface ResolvedSpec {
  readonly format: "openapi-2.0" | "openapi-3.0" | "openapi-3.1";
  readonly document: unknown;  // parsed, $ref-resolved JSON
  readonly metadata: {
    readonly title: string;
    readonly version: string;
  };
}
```

### 2. Secondary adapter: `SpecInputAdapter`

A single adapter implements both methods:

- **`fromUrl`**: HTTP GET, detect content type (JSON/YAML), parse, validate OpenAPI version, resolve `$ref`, return `ResolvedSpec`
- **`fromFile`**: Detect format from extension and content, parse, validate, resolve `$ref`, return `ResolvedSpec`

This adapter imports a YAML parser (e.g., `yaml` npm package) and an OpenAPI dereferencer (e.g., `@apidevtools/json-schema-ref-parser`). These are secondary adapter dependencies — the port and domain remain dependency-free.

### 3. Web adapter: file drop zone

The web adapter adds a drop zone to the input area:

- Uses the `File` API / `DataTransfer` to read dropped files
- Calls `SpecInputPort.fromFile()` with the file content
- Populates the textarea with the resolved JSON (for transparency)
- All DOM updates use `textContent` or `createElement` (per ADR-004)

### 4. Web adapter: URL input

A URL input field alongside each textarea:

- User pastes a URL and clicks "Fetch"
- Web adapter calls `POST /api/fetch-spec` with the URL
- Server-side handler calls `SpecInputPort.fromUrl()`
- Returns resolved JSON to populate the textarea

Fetching happens server-side to avoid CORS issues with third-party API hosts.

### 5. Validation gate (enforcing Coq preconditions)

Before any spec reaches `computeDiff`, the `SpecInputAdapter` validates:

| Coq precondition | Validation check |
|---|---|
| `well_formed` (unique fields) | JSON parse guarantees unique keys (RFC 7159) |
| `bounded_depth` (<= 10) | `$ref` resolution eliminates circular refs; post-resolution depth check |
| `proper_leaf` (no ambiguous leaves) | OpenAPI schema types are known primitives/arrays/objects |
| OpenAPI 2.0 or 3.0 format | Check `swagger: "2.0"` or `openapi: "3.x.x"` field |

If validation fails, the adapter returns a descriptive error rather than feeding malformed data to the domain.

## Consequences

- Users can compare specs from live endpoints without manual copy-paste
- File drop enables offline workflows and CI-exported spec comparison
- YAML support broadens compatibility (many OpenAPI specs are YAML-first)
- Server-side fetch avoids CORS but means the server must be running for URL input
- Two new dependencies (YAML parser, `$ref` resolver) are isolated in the secondary adapter
- The validation gate ensures the Coq-verified preconditions hold at runtime — the formal proofs remain applicable to all inputs that pass validation
- The `SchemaFetchPort` from ADR-005 can delegate to `SpecInputPort.fromUrl()` internally, reducing duplication

## Alternatives Considered

### Client-side fetch only
Rejected: CORS policies on most API hosts would block browser-side requests. Server-side fetch is necessary for reliability.

### Separate ports for URL vs file
Rejected: Both methods produce the same `ResolvedSpec`. A single port with two methods keeps the interface cohesive and avoids duplicate validation logic.

### Skip validation (trust the input)
Rejected: The Coq proofs guarantee correctness *given* well-formed OpenAPI input. Without the validation gate, malformed specs could produce nonsensical diffs that appear correct. The validation cost is negligible compared to the diff computation.
