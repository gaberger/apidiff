<div align="center">

# apidiff

**API migration toolkit** &mdash; compare OpenAPI specs, detect breaking changes, and emit machine-readable changesets.

[![Built with hex](https://img.shields.io/badge/built%20with-hex-C8B496?style=flat-square)](https://github.com/gaberger/hex)
[![Tests](https://img.shields.io/badge/tests-51%20passing-16a34a?style=flat-square)](#tests)
[![Validation](https://img.shields.io/badge/algorithm%20validation-27%2F27%20(100%25)-16a34a?style=flat-square)](#algorithm-validation)
[![Formally Verified](https://img.shields.io/badge/formally%20verified-Coq%2FRocq-9333ea?style=flat-square)](proofs/)
[![Changeset Spec](https://img.shields.io/badge/spec-API%20Changeset%20v0.2-0ea5e9?style=flat-square)](apidiffspec/api-changeset-schema.json)

</div>

---

Compare OpenAPI specs across versions to detect renamed fields, type changes, removed endpoints, and new additions. Generate migration guides. Parse release notes into a **schema-valid changeset document** that describes every mutation between two API versions in a form both humans and machines can consume.

## Contents

- [Install](#install)
- [CLI](#cli)
  - [`apidiff diff`](#apidiff-diff)
  - [`apidiff guide`](#apidiff-guide)
  - [`apidiff schema`](#apidiff-schema)
  - [`apidiff report`](#apidiff-report--release-notes--api-changeset)
- [API Changeset Specification](#api-changeset-specification)
- [Features](#features)
- [Architecture](#architecture)
- [Algorithm Validation](#algorithm-validation)
- [Tests](#tests)
- [Architecture Decision Records](#architecture-decision-records)
- [Security](#security)

---

## Install

### Cross-platform binary (recommended)

Single-file executables with the Bun runtime embedded — no Node, no `bun install`, no toolchain. Pulled straight from the [GitHub Releases page](https://github.com/gaberger/apidiff/releases/latest).

| Platform | Asset |
|---|---|
| Linux x64 | `apidiff-linux-x64` |
| Linux arm64 | `apidiff-linux-arm64` |
| macOS x64 (Intel) | `apidiff-darwin-x64` |
| macOS arm64 (Apple Silicon) | `apidiff-darwin-arm64` |
| Windows x64 | `apidiff-windows-x64.exe` |

```bash
# Linux x64 — install to ~/.local/bin (already on PATH on most distros)
gh release download --pattern 'apidiff-linux-x64' -O ~/.local/bin/apidiff
chmod +x ~/.local/bin/apidiff

# macOS arm64
gh release download --pattern 'apidiff-darwin-arm64' -O ~/.local/bin/apidiff
chmod +x ~/.local/bin/apidiff

# Verify
apidiff
```

Pin a specific version with `gh release download v0.2.1 --pattern ...`, or use the helper script that picks the right asset for your host and waits for any in-flight release workflow before reinstalling:

```bash
bash scripts/install-latest.sh                  # latest release, current host
bash scripts/install-latest.sh --tag v0.2.0     # pin a tag
bash scripts/install-latest.sh --dest /usr/local/bin
```

### From source

```bash
bun install

# Web UI (http://localhost:4747)
bun run start:web

# CLI from source
bun src/cli.ts report https://docs.fwd.app/release-notes/api/2026/release.26.3.0/

# Cross-compile binaries for all 5 platforms → dist/
bun run build:bin:all
```

---

## CLI

```
apidiff diff   <v1.json> <v2.json>                          Compare two JSON spec files
apidiff diff   --provider <name> <old_ver> <new_ver>        Fetch & compare provider specs
apidiff guide  <v1.json> <v2.json> [--base v1] [--rev v2]   Generate migration guide
apidiff schema <base_url> <revision_url> [--mode changelog] Compare OpenAPI schemas via oasdiff
apidiff report <url> [--out path] [--verbose] [--no-yaml]   Release-notes → api-changeset YAML + summary
```

Providers wired for `--provider`: `stripe`, `github`, `twilio`, `forward`.

### `apidiff diff`

Compare two OpenAPI documents (file paths or URLs) and print a structured change list with classifications: `renamed`, `moved`, `removed`, `added`, `type-change`, `changed`, `unchanged`.

```bash
apidiff diff old.json new.json
apidiff diff --provider forward 26.2 26.3
apidiff diff --provider stripe v2228 v2229
```

### `apidiff guide`

Generate a migration guide (markdown + interactive checklist) between two specs.

```bash
apidiff guide old.json new.json --base v1 --revision v2 --sunset 2025-06-30
```

### `apidiff schema`

Compare two OpenAPI URLs through the [`oasdiff`](https://github.com/oasdiff/oasdiff) binary. Modes: `changelog` (default), `breaking`, `summary`.

```bash
apidiff schema base.json revision.json --mode breaking --fail-on-breaking
```

`--fail-on-breaking` exits non-zero if any breaking change is found — useful for CI gates.

### `apidiff report` — release notes → api-changeset

Fetches an HTML release-notes page, parses its sections (Breaking / Scheduled-breaking / Query-param / New ops / New models / Model changes / Doc changes), maps each item into an entry that conforms to the **[API Changeset v0.2 schema](apidiffspec/api-changeset-schema.json)**, writes the YAML, and prints a compact terminal summary.

```bash
apidiff report https://docs.fwd.app/release-notes/api/2026/release.26.3.0/
```

```
Forward Networks API  26.3.0
released 2026-03-17
https://docs.fwd.app/release-notes/api/2026/release.26.3.0/

  breaking         1  [█.......................]
  deprecations     6  [████████................]
  notice          15  [███████████████████.....]
  info             3  [████....................]
  total           19  [████████████████████████]

Breaking changes  (1)
  • FWD-41282
      POST /api/nqe  +1 more

Scheduled breaking changes  (6)
  • FWD-48774
      GET /api/networks/{networkId}/snapshots  +3 more
  ...

✓ wrote changeset-26.3.0.yaml  (19 changes)
```

| Flag | Purpose |
|---|---|
| `--out <path>` | YAML output path (default: `./changeset-<version>.yaml`) |
| `--no-yaml` | Skip writing YAML; terminal report only |
| `--verbose` | Full per-item breakdown — wrapped descriptions + every affected op |
| `--api-name <name>` | Override `api.name` (default: inferred from URL host) |
| `--from <ver>` / `--to <ver>` | Override `api.from.version` / `api.to.version` |
| `--released <YYYY-MM-DD>` | Override release date |
| `--raw-html <path>` | Skip fetch — parse a local HTML file (useful for JS-rendered pages) |
| `--no-color` | Disable ANSI (auto-disabled when stdout is not a TTY) |

Release-notes URLs missing a trailing slash are auto-retried with `/` appended (Docusaurus sites like fwd.app 404 without it). The CLI's top-level error handler prints a one-line `error: …` message on failure instead of a runtime stack.

---

## API Changeset Specification

The `report` subcommand emits documents that conform to the **API Changeset** spec — a structured format for describing every mutation between two versions of an OpenAPI document in a form both human-readable and machine-parseable.

| File | Purpose |
|---|---|
| [`apidiffspec/api-changeset-schema.json`](apidiffspec/api-changeset-schema.json) | JSON Schema (Draft 2020-12) defining `changeset_version: "0.2"` |
| [`apidiffspec/example-changeset.yaml`](apidiffspec/example-changeset.yaml) | Annotated example covering every operation family |

### Design intent

A changeset describes "how we got from spec A to spec B" alongside the specs themselves, not derived from them. This matters because some mutations are **author-only**: they can't be recovered by diffing two OpenAPI documents (e.g. semantic shifts where the shape stays the same but the meaning changes).

### Operation families

| Family | Operations | When `at` / `from` / `to` are used |
|---|---|---|
| **Structural** | `add`, `remove`, `rename`, `move`, `split`, `merge`, `replace`, `recompose` | `from` and/or `to` JSON Pointers into the relevant spec |
| **Constraint** | `tighten`, `loosen`, `constrain`, `retype`, `redefault`, `recode` | `at` — pointer modified in place |
| **Semantic** (author-only) | `resemanticize`, `reorder`, `retime`, `annotate` | `at` — cannot be detected by spec diff |
| **Lifecycle** | `deprecate`, `sunset`, `restore`, `withdraw` | `at` + `lifecycle` block |

### Severity

Independent of `breaking`. Three levels: `info` (cosmetic/internal), `notice` (non-breaking but behavior-affecting — new enum values, new rate limits), `breaking` (consumers must act). Setting `severity: breaking` or `breaking: true` requires a `migration` block.

### Target kinds

`endpoint`, `operation`, `path-parameter`, `query-parameter`, `header-parameter`, `cookie-parameter`, `request-body`, `request-field`, `response`, `response-field`, `response-header`, `status-code`, `schema`, `schema-field`, `enum-value`, `security-scheme`, `content-type`, `server`, `rate-limit`, `auth`, `webhook`, `callback`, `example`, `discriminator`, `link`, `tag`.

### Pointers

JSON Pointers per [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901), optionally `#`-prefixed for URI-fragment style. A change that touches N coordinated locations (e.g. a field renamed across 12 endpoint schemas) is **one** change entry with an N-element pointer array, not N linked entries.

### Lifecycle metadata

Aligned with [RFC 9745 Deprecation](https://www.rfc-editor.org/rfc/rfc9745) and [RFC 8594 Sunset](https://www.rfc-editor.org/rfc/rfc8594):

```yaml
lifecycle:
  deprecated_date: 2026-04-20
  sunset_date:     2026-10-20
  replacement:     "#/paths/~1search~1advanced/get"
  reason:          "Search endpoint replaced by typed query DSL"
```

### Mapping table — release notes → changeset

The `report` subcommand uses these defaults when mapping fwd.app-style release-notes buckets:

| Release-notes bucket | `op` | `target` | `severity` | Has `migration` |
|---|---|---|---|---|
| Breaking changes | `constrain` | `schema-field` | `breaking` | yes |
| Scheduled breaking changes | `deprecate` | `schema-field` | `notice` | no (lifecycle) |
| Query parameter changes | `constrain` | `query-parameter` | `notice` | no |
| New operations | `add` | `operation` | `notice` | no |
| New models | `add` | `schema` | `info` | no |
| Model changes | `constrain` | `schema` | `notice` | no |
| Documentation changes | `annotate` | `schema` | `info` | no |

`constrain` is used as the safest generic op when the release notes describe a change without enough information to commit to `tighten`/`loosen`/`retype`. Override via `--out` and edit by hand for higher fidelity.

### External standards referenced

- **[OpenAPI Specification 3.x](https://spec.openapis.org/oas/v3.1.0)** — the documents the changeset describes
- **[JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)** — the schema's own meta-schema
- **[RFC 6901 — JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901)** — addressing into OpenAPI documents
- **[RFC 9745 — Deprecation](https://www.rfc-editor.org/rfc/rfc9745)** + **[RFC 8594 — Sunset](https://www.rfc-editor.org/rfc/rfc8594)** — lifecycle timing
- **[Semver 2.0](https://semver.org)** — `changeset_version` field

### Validating a changeset locally

```bash
bun -e '
const Ajv = (await import("ajv/dist/2020.js")).default;
const yaml = await import("yaml");
const schema = JSON.parse(await Bun.file("apidiffspec/api-changeset-schema.json").text());
const doc = yaml.parse(await Bun.file("changeset-26.3.0.yaml").text());
const v = new Ajv({strict:false}).compile(schema);
console.log(v(doc) ? "✓ valid" : v.errors);
'
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Spec diffing** | Compare two OpenAPI specs (JSON/YAML) with structured change breakdown |
| **Change classification** | Every difference classified as `renamed`, `moved`, `removed`, `added`, `type-change`, `changed`, `unchanged` |
| **Migration guides** | Auto-generated guides with timelines, severity ratings, and interactive checklists |
| **Release-notes → changeset** | `apidiff report <url>` parses release-notes HTML into a [schema-valid](apidiffspec/api-changeset-schema.json) api-changeset YAML |
| **Integration library** | Pre-loaded spec comparisons for Stripe, HubSpot, Twilio, GitHub, Shopify, Slack |
| **Algorithm validation** | Each integration includes documented change notes — validates diff detection accuracy |
| **Diff-aware editors** | Side-by-side editors with line highlighting colored by change type |
| **Scroll sync** | Optional lock/unlock synchronized scrolling between old and new editors |
| **File drop & URL fetch** | Load specs by pasting, dragging files, or fetching from a URL |
| **Markdown export** | Download migration guides as `.md` files |
| **Cross-platform binaries** | Single-file executables for Linux/macOS/Windows (x64 + arm64), no runtime needed |

---

## Architecture

Built with [**hex**](https://github.com/gaberger/hex) &mdash; hexagonal architecture (ports & adapters) with enforced boundary rules.

```
src/
  core/
    domain/          # Pure business logic, zero external deps
    ports/           # Typed interfaces (contracts between layers)
    usecases/        # Application logic composing ports
  adapters/
    primary/         # Driving: CLI, Web UI
    secondary/       # Driven: storage, API fetch, oasdiff
  composition-root   # Wires adapters to ports (single DI point)
```

> **Boundary rules** enforced by `hex analyze .`:
> - `domain/` imports nothing outside `domain/`
> - `ports/` may only import from `domain/`
> - `adapters/` may only import from `ports/` (never other adapters)
> - `composition-root` is the only file that imports adapters
>
> Current status: **A+ / 100/100 — 0 boundary violations across 70 source files**.

The release-notes-to-changeset pipeline lives in `src/core/domain/release-notes-changeset.ts` as a pure module (HTML in → structured types → YAML/markdown out). IO (fetch + file writes) stays in `src/cli.ts`.

---

## Algorithm Validation

The diff algorithm is validated against documented API breaking changes from 6 major providers. Each integration includes `changeNotes` &mdash; real breaking changes from official changelogs &mdash; and a validation panel checks whether the algorithm detected each one.

### Results: 27/27 documented changes detected (100%)

| Provider | Endpoint | Documented Changes | Detected | Score |
|:---------|:---------|:------------------:|:--------:|:-----:|
| **Stripe** | Customer schema | 4 | 4/4 | :white_check_mark: 100% |
| **Stripe** | Charge schema | 2 | 2/2 | :white_check_mark: 100% |
| **HubSpot** | Contacts endpoint | 4 | 4/4 | :white_check_mark: 100% |
| **Twilio** | Messages endpoint | 4 | 4/4 | :white_check_mark: 100% |
| **GitHub** | Users endpoint | 3 | 3/3 | :white_check_mark: 100% |
| **Shopify** | Product schema | 5 | 5/5 | :white_check_mark: 100% |
| **Slack** | channels &rarr; conversations | 5 | 5/5 | :white_check_mark: 100% |

<details>
<summary><strong>Validated change types</strong></summary>

- **Renames:** `billing` &rarr; `collection_method`, `sid` &rarr; `message_sid`, `body_html` &rarr; `descriptionHtml`
- **Type changes:** `price` string &rarr; object, `num_segments` string &rarr; integer
- **Removals:** `gravatar_id`, `sources`, `identity_profiles`
- **Additions:** `invoice_settings`, `node_id`, `twitter_username`, `subresource_uris`
- **Structural:** REST &rarr; GraphQL endpoints, Swagger 2.0 &rarr; OpenAPI 3.0, enum casing changes
- **Path migrations:** `/channels.*` &rarr; `/conversations.*`, `/contacts/v2/` &rarr; `/crm/v3/`

</details>

The core diff algorithm is also [**formally verified with Coq/Rocq proofs**](proofs/) for totality, determinism, and structural consistency.

---

## Tests

```bash
bun test
# 51 pass, 0 fail across 5 test files
```

---

## Architecture Decision Records

| ADR | Decision |
|:----|:---------|
| [001](docs/adrs/ADR-001-hexagonal-architecture.md) | Hexagonal architecture with strict boundary rules |
| [002](docs/adrs/ADR-002-bun-runtime.md) | Bun as the runtime |
| [003](docs/adrs/ADR-003-pure-domain-diff-algorithm.md) | Pure domain diff algorithm with no external deps |
| [004](docs/adrs/ADR-004-xss-prevention-in-web-adapter.md) | XSS prevention &mdash; no `innerHTML` with external data |
| [005](docs/adrs/ADR-005-schema-diff-via-oasdiff.md) | Schema diff via oasdiff binary |
| [006](docs/adrs/ADR-006-in-memory-storage-with-adapter-swap.md) | In-memory storage with adapter swap |
| [007](docs/adrs/ADR-007-synced-scroll-and-diff-highlighting.md) | Synchronized scroll and diff-aware highlighting |
| [008](docs/adrs/ADR-008-openapi-spec-input-via-rest-and-file-drop.md) | OpenAPI spec input via REST and file drop |
| [009](docs/adrs/ADR-009-popular-api-integrations-sidebar.md) | Popular API integrations sidebar |

---

## Security

- Zero `innerHTML`/`outerHTML`/`insertAdjacentHTML` with external data ([ADR-004](docs/adrs/ADR-004-xss-prevention-in-web-adapter.md))
- All dynamic rendering uses `document.createElement()` + `textContent`
- No secrets in repository
- Release binaries are reproducible: each release ships a `SHA256SUMS` file with checksums; verify with `sha256sum -c --ignore-missing SHA256SUMS`

---

<div align="center">
<sub>Built with <a href="https://github.com/gaberger/hex">hex</a> &mdash; hexagonal architecture tooling</sub>
</div>
