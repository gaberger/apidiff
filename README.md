<div align="center">

# apidiff

**API migration toolkit** &mdash; compare OpenAPI specs, detect breaking changes, generate migration guides.

[![Built with hex](https://img.shields.io/badge/built%20with-hex-C8B496?style=flat-square)](https://github.com/gaberger/hex)
[![Tests](https://img.shields.io/badge/tests-51%20passing-16a34a?style=flat-square)](#tests)
[![Validation](https://img.shields.io/badge/algorithm%20validation-27%2F27%20(100%25)-16a34a?style=flat-square)](#algorithm-validation)
[![Formally Verified](https://img.shields.io/badge/formally%20verified-Coq%2FRocq-9333ea?style=flat-square)](proofs/)

</div>

---

Compare OpenAPI specs across versions to detect renamed fields, type changes, removed endpoints, and new additions. Auto-generate migration checklists with timelines, severity ratings, and progress tracking.

## Quick Start

### CLI — single-file binary (no toolchain needed)

Download the binary for your platform from the [latest release](https://github.com/gaberger/apidiff/releases/latest) and drop it on your `PATH`:

```bash
# Linux x64
gh release download --pattern 'apidiff-linux-x64' -O ~/.local/bin/apidiff && chmod +x ~/.local/bin/apidiff

# macOS arm64
gh release download --pattern 'apidiff-darwin-arm64' -O ~/.local/bin/apidiff && chmod +x ~/.local/bin/apidiff

# Try it
apidiff report https://docs.fwd.app/release-notes/api/2026/release.26.3.0/
```

Binaries are produced for `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `windows-x64`. They embed the Bun runtime — no Node, no install step.

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

## CLI

```
apidiff diff   <v1.json> <v2.json>                         # Compare two JSON spec files
apidiff diff   --provider <name> <old_ver> <new_ver>       # Fetch & compare provider specs
apidiff guide  <v1.json> <v2.json> [--base v1] [--rev v2]  # Generate migration guide
apidiff schema <base_url> <revision_url> [--mode changelog]# Compare OpenAPI schemas via oasdiff
apidiff report <url> [--out path] [--verbose] [--no-yaml]  # Release-notes → api-changeset YAML + summary
```

### `apidiff report` — release notes → api-changeset

Fetches an HTML release-notes page, parses its sections (Breaking / Scheduled-breaking / New ops / New models / Model changes / Doc changes), and emits a YAML changeset that validates against [`apidiffspec/api-changeset-schema.json`](apidiffspec/api-changeset-schema.json) — plus a compact terminal summary.

```bash
apidiff report https://docs.fwd.app/release-notes/api/2026/release.26.3.0/

# →
# Forward Networks API  26.3.0
# released 2026-03-17
#
#   breaking         1  [#.......................]
#   deprecations     6  [########................]
#   notice          15  [###################.....]
#   info             3  [####....................]
#   total           19  [########################]
#
# Breaking changes  (1)
#   • FWD-41282
#       POST /api/nqe  +1 more
# ...
# ✓ wrote changeset-26.3.0.yaml  (19 changes)
```

| Flag | Purpose |
|---|---|
| `--out <path>` | YAML output path (default: `./changeset-<version>.yaml`) |
| `--no-yaml` | Skip writing YAML, terminal report only |
| `--verbose` | Full per-item breakdown with descriptions + every affected op |
| `--api-name <name>` | Override `api.name` in the changeset (default: inferred from URL host) |
| `--from <ver>` / `--to <ver>` | Override `api.from.version` / `api.to.version` |
| `--released <YYYY-MM-DD>` | Override release date |
| `--raw-html <path>` | Skip fetch — parse local HTML (useful for JS-rendered pages) |
| `--no-color` | Disable ANSI (auto-disabled when stdout is not a TTY) |

The YAML conforms to API Changeset v0.2 — see [`apidiffspec/`](apidiffspec/) for the schema and an annotated example.

## Features

| Feature | Description |
|---------|-------------|
| **Spec Diffing** | Compare two OpenAPI specs (JSON/YAML) with structured change breakdown |
| **Change Classification** | Every difference classified as `renamed` `moved` `removed` `added` `type-change` `changed` `unchanged` |
| **Migration Guides** | Auto-generated guides with timelines, severity ratings, and interactive checklists |
| **Integration Library** | Pre-loaded spec comparisons for Stripe, HubSpot, Twilio, GitHub, Shopify, Slack |
| **Algorithm Validation** | Each integration includes documented change notes &mdash; validates diff detection accuracy |
| **Diff-Aware Editors** | Side-by-side editors with line highlighting colored by change type |
| **Scroll Sync** | Optional lock/unlock synchronized scrolling between old and new editors |
| **File Drop & URL Fetch** | Load specs by pasting, dragging files, or fetching from a URL |
| **Markdown Export** | Download migration guides as `.md` files |
| **Release-notes → Changeset** | `apidiff report <url>` parses release-notes HTML into a schema-valid api-changeset YAML |
| **Cross-platform binaries** | Single-file executables for Linux/macOS/Windows (x64 + arm64), no runtime needed |

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

## Tests

```bash
bun test
# 51 pass, 0 fail across 5 test files
```

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

## Security

- Zero `innerHTML`/`outerHTML`/`insertAdjacentHTML` with external data ([ADR-004](docs/adrs/ADR-004-xss-prevention-in-web-adapter.md))
- All dynamic rendering uses `document.createElement()` + `textContent`
- No secrets in repository

---

<div align="center">
<sub>Built with <a href="https://github.com/gaberger/hex">hex</a> &mdash; hexagonal architecture tooling</sub>
</div>
