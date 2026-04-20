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
  at:   Pointer.optional(),
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
- id = FWD ticket verbatim.
- description = the original item description, prefixed with the area when helpful.
- Parse "will be removed in release X.Y.Z" from deprecation descriptions into lifecycle.reason.
- For breaking=true, always set migration.client_action.
- tags[] includes the bucket, the area (lowercase dash-separated), and the ticket ID.
- Return a complete Changeset with changeset_version "0.2" and api.from/to populated.`;

function countItems(diff: unknown): number {
  if (!diff || typeof diff !== "object") return 0;
  const d = diff as Record<string, { added?: unknown[]; removed?: unknown[] }>;
  let n = 0;
  for (const k of ["breakingChanges", "scheduledBreakingChanges", "newOperations", "newModels", "modelChanges"]) {
    n += (d[k]?.added?.length ?? 0) + (d[k]?.removed?.length ?? 0);
  }
  return n;
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
    const jsonText = (fenced ? fenced[1] : text).trim();
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

    res.status(200).json(validated.data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[extract-changeset] generateText threw: ${msg}`);
    res.status(500).json({ error: `AI extraction failed: ${msg}` });
  }
}
