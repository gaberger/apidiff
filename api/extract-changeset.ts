// AI-powered Changeset extractor (Vercel Function, Node runtime).
//
// Accepts a pre-parsed release-notes diff entry (from
// src/data/release-notes-diff.json) and returns a Changeset v0.2 document.
// The client already has structured data — we don't re-fetch the HTML.
// Dropping the 25 KB HTML payload cuts inference time from ~4 min to <30 s
// on claude-sonnet-4.6 because the model no longer has to parse DOM.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateText } from "ai";
import { z } from "zod";

const OP = z.enum([
  "add", "remove", "rename", "move", "split", "merge", "replace", "recompose",
  "tighten", "loosen", "constrain", "retype", "redefault", "recode",
  "resemanticize", "reorder", "retime", "annotate",
  "deprecate", "sunset", "restore", "withdraw",
]);

const TARGET = z.enum([
  "endpoint", "operation", "path-parameter", "query-parameter",
  "header-parameter", "cookie-parameter", "request-body", "request-field",
  "response", "response-field", "response-header", "status-code",
  "schema", "schema-field", "enum-value", "security-scheme", "content-type",
  "server", "rate-limit", "auth", "webhook", "callback",
  "example", "discriminator", "link", "tag",
]);

const SEVERITY = z.enum(["info", "notice", "breaking"]);

const Pointer = z.string().describe(
  "RFC 6901 JSON Pointer. Use '~1' for '/' and '~0' for '~'. " +
  "Prefer '#/paths/~1<escaped-path>/<method>' or '#/components/schemas/<Name>'. " +
  "Fall back to '#/changelog/<bucket>/<ticket-id>' when no real path is known.",
);

const Change = z.object({
  id: z.string().describe("Prefer the FWD ticket ID verbatim (e.g. 'FWD-50059')."),
  op: OP,
  target: TARGET,
  severity: SEVERITY,
  breaking: z.boolean().optional(),
  detectable: z.boolean().optional(),
  description: z.string(),
  rationale: z.string().optional(),
  from: z.union([Pointer, z.array(Pointer)]).optional(),
  to:   z.union([Pointer, z.array(Pointer)]).optional(),
  // Lenient: accept array from the model and collapse to first entry in
  // post-processing. v0.2 spec formally requires a single pointer.
  at:   z.union([Pointer, z.array(Pointer)]).optional(),
  // Inline snapshots so a human reader doesn't need to resolve the JSON
  // Pointer against the OpenAPI spec to understand what changed.
  before: z.unknown().optional(),
  after:  z.unknown().optional(),
  // Endpoints that consume a changed schema/field — emitted even when the
  // primary pointer points at a schema node, so readers see the blast radius.
  affectedOperations: z.array(Pointer).optional(),
  // Human-friendly labels for affectedOperations (and for at/from/to when
  // they resolve to paths). Array indexes line up with affectedOperations.
  humanReadable: z.array(z.string()).optional(),
  // Jump-to-spec shortcuts: the raw per-section OpenAPI file plus the
  // ticket's docs page. Populated by the caller, not the model — ignored
  // if the model fabricates URLs.
  source: z.object({
    specUrl: z.string().url().optional(),
    docsUrl: z.string().url().optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
  lifecycle: z.object({
    deprecated_date: z.string().optional(),
    sunset_date: z.string().optional(),
    replacement: Pointer.optional(),
    reason: z.string().optional(),
  }).optional(),
  migration: z.object({
    client_action: z.string().optional(),
    automated: z.boolean().optional(),
  }).optional(),
});

const Changeset = z.object({
  changeset_version: z.literal("0.2"),
  api: z.object({
    name: z.string(),
    from: z.object({ version: z.string() }),
    to:   z.object({ version: z.string() }),
  }),
  released: z.string().optional(),
  summary: z.string().optional(),
  changes: z.array(Change),
});

const SYSTEM_PROMPT = `You convert Forward Networks release-notes diff entries into API Changeset v0.2 documents.

Each bucket in the diff has { added, removed } lists. Each item is
{ title, area, description, affectedOps[] } where title is an FWD-XXXXX ticket
and affectedOps is an array of { method, path, query } — this is the HTTP verb
and path of the affected endpoint when the release note cited one.

Mapping rules — bucket + item flavor maps to Changeset op/target/severity:

  Bucket                           | op         | target        | severity | breaking | notes
  -------------------------------- | ---------- | ------------- | -------- | -------- | ---------------------------
  newOperations.added              | add        | endpoint      | info     | false    |
  newOperations.removed            | remove     | endpoint      | breaking | true     |
  newModels.added                  | add        | schema        | info     | false    |
  newModels.removed                | remove     | schema        | breaking | true     |
  modelChanges.added (field added) | add        | schema-field  | info     | false    | when description reads "added X"
  modelChanges.added (field rem.)  | remove     | schema-field  | breaking | true     | when description reads "removed X"
  modelChanges.added (renamed)     | rename     | schema-field  | breaking | true     | when description reads "renamed X to Y"
  modelChanges.added (retyped)     | retype     | schema-field  | breaking | true     | when description reads "changed type"
  modelChanges.added (tightened)   | tighten    | schema-field  | breaking | true     | "stricter", "now required", narrower bounds
  modelChanges.added (loosened)    | loosen     | schema-field  | info     | false    | "optional", wider bounds
  modelChanges.added (recoded)     | recode     | schema-field  | breaking | true     | format/encoding/units change
  modelChanges.added (other)       | constrain  | schema-field  | notice   | false    | fallback
  breakingChanges.added            | constrain  | schema-field  | breaking | true     | classify harder via description if possible
  scheduledBreakingChanges.added   | deprecate  | endpoint      | notice   | false    | sunset parsed into lifecycle.reason

Pointer rules — every change MUST carry a pointer field. NEVER return a change
without one. Which field is which:

  op                                 | field to populate
  ---------------------------------- | --------------------------
  add                                | to
  remove, withdraw                   | from
  rename, move, replace, recompose   | from AND to (both)
  split                              | from (single) + to (array of 2+)
  merge                              | from (array of 2+) + to (single)
  deprecate, sunset, restore         | at
  tighten, loosen, constrain,        | at
    retype, redefault, recode,       |
    resemanticize, reorder, retime,  |
    annotate                         |

Pointer source priority:

  1. If the item's affectedOps array contains { method, path } entries,
     emit "#/paths/<escaped-path>/<method-lower>" for each. Escape '/' as
     '~1' and '~' as '~0'. Example: {method:"POST", path:"/api/collector-tasks"}
     -> "#/paths/~1api~1collector-tasks/post". Multiple ops -> array.

  2. If the description names a schema ("Added CollectorTask"), emit
     "#/components/schemas/CollectorTask".
     If it names a field on a schema ("Order.amount" or "itemFormat in
     NqeQueryOptions"), emit
     "#/components/schemas/<Schema>/properties/<field>".

  3. If neither works, fall back to "#/changelog/<bucket>/<ticket-id>".

Worked example:

  Input item (bucket: newOperations.added):
    { title: "FWD-50059", area: "Network Collection",
      description: "",
      affectedOps: [{method:"POST", path:"/api/collector-tasks", query:"type=NETWORK_COLLECTION"}] }

  Correct change:
    { id: "FWD-50059", op: "add", target: "endpoint",
      severity: "info", breaking: false,
      description: "Network Collection",
      to: "#/paths/~1api~1collector-tasks/post",
      tags: ["new-operation", "network-collection", "FWD-50059"] }

Other rules:
- id = the ticket title VERBATIM from the input item (e.g. "FWD-50059" or
  "FWDN-11999"). NEVER invent IDs, NEVER append suffixes like "-schema" or
  "-classic-devices". If a single ticket affects multiple schemas OR multiple
  endpoints, emit ONE change entry with a pointer ARRAY in from/to — not
  multiple entries with fabricated IDs.
- ONE change entry per ticket. Every id in your output must match a title
  present in the input diff; the post-validator rejects invented IDs.
- description = the original item description, prefixed with the area when helpful.
- Parse "will be removed in release X.Y.Z" from deprecation descriptions into lifecycle.reason.
- For breaking=true, always set migration.client_action.
- tags[] includes the bucket, the area (lowercase dash-separated), and the ticket ID.
- Return a complete Changeset with changeset_version "0.2" and api.from/to populated.

CRITICAL — make each change self-describing so readers don't have to resolve
JSON Pointers against the OpenAPI spec:

- When the description uses "changed from X to Y" phrasing (default values,
  type changes, format changes, enum values), populate before/after with the
  literal values. Example for FWD-41282:
    before: "LEGACY"
    after: "JSON"

- When the change points at a schema or schema-field but the item's affectedOps
  carries the endpoints that consume it, ALSO emit affectedOperations as an
  array of pointers in "#/paths/~1<path>/<method>" form — one per affectedOp.
  This is the blast radius: readers see which endpoints are touched without
  having to open the spec.

- ALWAYS emit humanReadable as a parallel array of "METHOD /path" strings,
  one per entry in affectedOperations. Example: for FWD-41282 emit
    affectedOperations: ["#/paths/~1api~1nqe/post", "#/paths/~1api~1nqe-diffs~1{before}~1{after}/post"]
    humanReadable:      ["POST /api/nqe",            "POST /api/nqe-diffs/{before}/{after}"]
  Indexes must line up one-to-one. humanReadable is for human eyes; the
  pointers are for tooling.

- Full worked example for FWD-41282 (schema default-value change):
    { id: "FWD-41282", op: "redefault", target: "schema-field",
      severity: "breaking", breaking: true,
      description: "NQE: itemFormat default changed in NqeQueryOptions.",
      at: "#/components/schemas/NqeQueryOptions/properties/itemFormat",
      before: "LEGACY",
      after: "JSON",
      affectedOperations: [
        "#/paths/~1api~1nqe/post",
        "#/paths/~1api~1nqe-diffs~1{before}~1{after}/post"
      ],
      migration: { client_action: "Send itemFormat: 'LEGACY' explicitly to preserve old behavior." },
      tags: ["breaking-change", "nqe", "FWD-41282"] }`;

function countItems(diff: unknown): number {
  if (!diff || typeof diff !== "object") return 0;
  const d = diff as Record<string, { added?: unknown[]; removed?: unknown[] }>;
  let n = 0;
  for (const k of ["breakingChanges", "scheduledBreakingChanges", "newOperations", "newModels", "modelChanges"]) {
    n += (d[k]?.added?.length ?? 0) + (d[k]?.removed?.length ?? 0);
  }
  return n;
}

function collectTitles(diff: unknown): Set<string> {
  const out = new Set<string>();
  if (!diff || typeof diff !== "object") return out;
  const d = diff as Record<string, { added?: Array<{ title?: string }>; removed?: Array<{ title?: string }> }>;
  for (const k of ["breakingChanges", "scheduledBreakingChanges", "newOperations", "newModels", "modelChanges"]) {
    for (const it of d[k]?.added ?? []) if (it?.title) out.add(it.title);
    for (const it of d[k]?.removed ?? []) if (it?.title) out.add(it.title);
  }
  return out;
}

function collectAreas(diff: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!diff || typeof diff !== "object") return out;
  const d = diff as Record<string, { added?: Array<{ title?: string; area?: string }>; removed?: Array<{ title?: string; area?: string }> }>;
  for (const k of ["breakingChanges", "scheduledBreakingChanges", "newOperations", "newModels", "modelChanges"]) {
    for (const it of [...(d[k]?.added ?? []), ...(d[k]?.removed ?? [])]) {
      if (it?.title && it?.area && !out.has(it.title)) out.set(it.title, it.area);
    }
  }
  return out;
}

function shortVersion(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d+\.\d+)(?:\.\d+)?$/);
  return m ? m[1] : v;
}

function sectionSlug(area: string | undefined): string | undefined {
  if (!area) return undefined;
  const slug = area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || undefined;
}

function deriveSource(
  toRelease: string | undefined,
  area: string | undefined,
  ticket: string | undefined,
  year: number | undefined,
) {
  const slug = sectionSlug(area);
  const ver = shortVersion(toRelease);
  const out: { specUrl?: string; docsUrl?: string } = {};
  if (slug && ver) out.specUrl = `https://docs.fwd.app/${ver}/api/spec/${slug}.json`;
  // Anchor back to the release-notes page for the ticket — verified pattern
  // (every FWD-xxx bullet has an id="FWD-xxx" on docs.fwd.app). Do NOT guess
  // at `/api/<section>/<ticket>` URLs; many 404.
  if (ticket && year && toRelease) {
    out.docsUrl = `https://docs.fwd.app/release-notes/api/${year}/release.${toRelease}/#${ticket}`;
  }
  return Object.keys(out).length ? out : undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();

  if (typeof req.query.ping !== "undefined") {
    res.status(200).json({
      ok: true,
      env: { AI_GATEWAY_API_KEY: !!process.env.AI_GATEWAY_API_KEY },
      t: Date.now() - t0,
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "POST required" });
    return;
  }

  const { diff, released, apiName = "Forward Networks API" } = (req.body ?? {}) as {
    diff?: Record<string, unknown>;
    released?: string;
    apiName?: string;
  };
  if (!diff || !diff.from || !diff.to) {
    res.status(400).json({ error: "diff with from/to is required" });
    return;
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    res.status(500).json({ error: "AI_GATEWAY_API_KEY is not set in the deployment environment" });
    return;
  }

  const itemCount = countItems(diff);
  const diffJson = JSON.stringify(diff, null, 2);
  console.log(`[extract-changeset] items=${itemCount} bytes=${diffJson.length} -> gateway`);

  try {
    const { text, usage } = await generateText({
      model: "anthropic/claude-sonnet-4.6",
      abortSignal: AbortSignal.timeout(90_000),
      system: SYSTEM_PROMPT + `\n\nOutput format: return a single JSON object conforming to the v0.2 Changeset shape. No markdown fences, no commentary — just the JSON.`,
      prompt:
        `API name: ${apiName}\n` +
        `Release date: ${released || "(unknown)"}\n\n` +
        `Pre-parsed release-notes diff:\n\n${diffJson}\n\n` +
        `Emit a Changeset v0.2 document as JSON. api.from.version = "${diff.from}", ` +
        `api.to.version = "${diff.to}", released = "${released || ""}". ` +
        `One change entry per ticket. Empty changes array if no items.`,
    });
    console.log(`[extract-changeset] text ${text.length} chars, usage=${JSON.stringify(usage)} t+${Date.now() - t0}ms`);

    // Extract JSON from the response. Accept either raw JSON or JSON wrapped
    // in ```json fences, since some runs may add them despite the prompt.
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonText = (fenced?.[1] ?? text).trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseErr) {
      res.status(502).json({
        error: "Model returned non-JSON output",
        sample: text.slice(0, 400),
      });
      return;
    }

    const validated = Changeset.safeParse(parsed);
    if (!validated.success) {
      res.status(502).json({
        error: "Model output failed v0.2 schema validation",
        issues: validated.error.issues.slice(0, 5),
        sample: jsonText.slice(0, 400),
      });
      return;
    }

    // Normalize: v0.2 requires `at` single-valued; collapse any arrays.
    // Reject invented IDs: every change.id must appear as a ticket title in
    // the input diff. Model has been observed inventing composite IDs like
    // "FWD-49532-schema" when one ticket affects multiple schemas; the
    // correct move is a pointer array, not a new entry.
    const realTitles = collectTitles(diff);
    const areas = collectAreas(diff);
    const toRelease = (diff as { to?: string })?.to;
    // Derive year from "26.3.0" -> 2026. Docs URLs need the 4-digit form.
    const yearMatch = toRelease?.match(/^(\d{2})\./);
    const year = yearMatch ? 2000 + Number(yearMatch[1]) : undefined;
    const invented: string[] = [];
    const changes = validated.data.changes.map((c) => {
      const at = Array.isArray(c.at) ? c.at[0] : c.at;
      if (!realTitles.has(c.id)) invented.push(c.id);
      // Server-derived source URLs (bypass model hallucination risk).
      const source = deriveSource(toRelease, areas.get(c.id), c.id, year);
      return { ...c, at, ...(source ? { source } : {}) };
    });

    if (invented.length > 0) {
      res.status(422).json({
        error: "Model invented ticket IDs not present in the release-notes diff",
        invented,
        hint: "Re-run — or use pointer arrays for multi-target changes instead of splitting into fake IDs.",
      });
      return;
    }

    res.status(200).json({ ...validated.data, changes });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[extract-changeset] generateText threw: ${msg}`);
    res.status(500).json({ error: `AI extraction failed: ${msg}` });
  }
}
