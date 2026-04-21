# ADR-017: Version-Centric Information Architecture

## Status
Proposed

## Date
2026-04-14

## Authors
Gary Berger

## Context
APIDIFF's purpose is to help developers **understand schema changes between API version updates** so they can plan code changes. The current UI does not fully grasp this purpose:

- **Versions are a second-class citizen.** The IntegrationHeader exposes two hidden dropdowns labeled "v1 / v2." Users have no visual grasp of *what versions exist* for a provider or *when they were released*. Version discovery is the app's whole reason to exist, yet it's the most buried interaction.
- **The Compare tab reads as a generic diff viewer.** Two side-by-side text editors and a filtered change list. There's nothing about "which API, which versions, which migration."
- **Breaking vs. non-breaking is not surfaced.** A rename and a required-field removal render identically in the DiffResults table. For migration planning, breaking-change severity is the single most important axis.
- **Diff rows are flat and path-level.** A 400-row diff for a typical API release is unreadable. The mental model users need is *per-endpoint impact*: "what changed on `POST /charges`? what changed on `GET /customers/{id}`?"
- **No code-impact framing.** Users see abstract JSONPath diffs but not "this request body field is now required" or "this response property is removed." The leap from diff to code change is left to the user.
- **Cataloging absent.** The provider sidebar is a picker, not a catalog. There is no "browse providers by category, see recent releases, see which ones have breaking changes pending."

## Decision

Reframe APIDIFF around **versions** as the first-class unit, not pasted spec blobs. Four IA changes:

### 1. Version Timeline (primary surface)
Replace the two hidden dropdowns in IntegrationHeader with a horizontal **timeline component** that renders every discovered version as a clickable dot on a time axis. User clicks two dots to select the comparison range. Clicking a single dot shows metadata (release date, breaking count if known, link to changelog). This telegraphs the app's purpose the instant an integration is selected.

### 2. Breaking-change severity on DiffResults
Every diff row gets a severity chip: `breaking | non-breaking | cosmetic`. Severity is computed from the diff type:
- `breaking` — removed endpoint, removed required field, required field added to request, response field removed, type change (non-widening)
- `non-breaking` — added endpoint, added optional field, added response field, description change
- `cosmetic` — example change, description reword, vendor-extension change

DiffSummary gains a breaking-count callout separate from the added/removed/modified tally.

### 3. Endpoint grouping in DiffResults
Results regroup by endpoint (`METHOD /path`) with an accordion per endpoint showing inner changes. Users see "12 endpoints changed" instead of "400 path-level diffs." Schema-level changes (components/schemas/*) group under a separate "Shared schemas" bucket. Users can flip back to flat view via a toggle.

### 4. Code-impact language
Diff rows describe the *consumer impact* not the path. Instead of `paths./charges.post.requestBody.content.application/json.schema.properties.amount.type: integer → string`, show:
- **Endpoint**: `POST /charges`
- **Change**: Request field `amount` type changed from integer to string
- **Action**: Update request serialization — integer → string parse

A secondary "Show raw JSONPath" toggle preserves the path-level view for spec authors.

## Scope
Primary adapter only. No domain change beyond adding a `severity` field to existing `DiffResult` rows (domain is pure, so this is a type extension + a classifier function in `src/core/domain/diff-severity.ts`).

Catalog-browsing ("recent releases, category view") is **out of scope** for this ADR — deferred to a follow-up. This ADR is about making the existing per-provider workflow version-centric.

## Consequences

### Positive
- **Purpose visible from the first interaction.** Picking Stripe from the sidebar now shows "2022-11-15 · 2023-08-16 · 2024-06-20" as a timeline. User instantly understands "this tool tracks what changed between releases."
- **Migration planning unblocked.** Breaking-change severity + per-endpoint grouping turn an opaque diff into a prioritized action list.
- **Domain stays pure.** Severity classification is a pure function on DiffResult — no I/O, no adapter coupling.

### Negative
- `DiffResult` type gains a field. Old persisted results (if any were serialized) would need migration. Current codebase does not persist results across sessions, so no migration is required in practice.
- Endpoint grouping has edge cases (changes to `components/schemas` without a corresponding endpoint reference). Handled by a "Shared schemas" bucket.

### Neutral
- Raw JSONPath view kept behind a toggle for spec authors who need it.

## Alternatives Considered

**1. Only add breaking-change badges, don't restructure.**
Rejected. Badges on 400 flat rows do not fix the core "this is unreadable at scale" problem.

**2. Make Catalog the primary surface (browse providers by category).**
Deferred. Cataloging is valuable but the current per-provider workflow is load-bearing — fix it first.

**3. LLM-generated migration narratives.**
Out of scope. Guide generation exists (MigrationGuide.jsx) and already handles narrative. This ADR is about the *diff surfacing* layer.

## Implementation Plan
See `docs/workplans/wp-adr-017-version-centric-ia.json`.

## References
- ADR-010 — configurable provider registry
- ADR-014/015/016 — design system, shadcn adoption, IA states
- src/components/diff/IntegrationHeader.jsx — current (hidden) version picker
- src/core/domain/diff-algorithm.ts — emits DiffResult rows to be augmented with severity
