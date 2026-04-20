// AI-powered Changeset extractor (Vercel Function, Node runtime).
//
// Accepts { year, version, fromVersion, apiName } via POST and returns a
// Changeset v0.2 document derived from the Forward Networks release-notes
// page for the target version. Uses Vercel AI Gateway with Anthropic Claude
// via the AI SDK's generateObject for structured output. Requires
// AI_GATEWAY_API_KEY in the deployment env (the SDK picks it up
// automatically and routes "anthropic/..." strings through the gateway).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateObject } from "ai";
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
  "RFC 6901 JSON Pointer into the OpenAPI spec, e.g. '#/paths/~1api~1orders/post'. " +
  "Escape '/' as '~1' and '~' as '~0'. Prefer real spec paths when the note cites " +
  "one; fall back to '#/changelog/<bucket>/<ticket-id>' when no path is resolvable.",
);

const Change = z.object({
  id: z.string().describe("Stable identifier. Prefer the FWD ticket ID verbatim (e.g. 'FWD-50059')."),
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

const SYSTEM_PROMPT = `You convert Forward Networks API release notes into API Changeset v0.2 documents.

Operation families and their ops:
  structural  : add, remove, rename, move, split, merge, replace, recompose
  constraint  : tighten, loosen, constrain, retype, redefault, recode
  semantic    : resemanticize, reorder, retime, annotate   (author-only, detectable: false)
  lifecycle   : deprecate, sunset, restore, withdraw

Mapping guidance for release-note sections:

  Section                            | op         | target        | severity   | breaking
  ---------------------------------- | ---------- | ------------- | ---------- | --------
  New operations                     | add        | endpoint      | info       | false
  Removed operations                 | remove     | endpoint      | breaking   | true
  New models                         | add        | schema        | info       | false
  Removed models                     | remove     | schema        | breaking   | true
  Model changes (field added)        | add        | schema-field  | info       | false
  Model changes (field removed)      | remove     | schema-field  | breaking   | true
  Model changes (type change)        | retype     | schema-field  | breaking   | true
  Model changes (stricter rule)      | tighten    | schema-field  | breaking   | true
  Model changes (looser rule)        | loosen     | schema-field  | info       | false
  Model changes (default changed)    | redefault  | schema-field  | notice     | false
  Model changes (encoding/format)    | recode     | schema-field  | breaking   | true
  Model changes (renamed field)      | rename     | schema-field  | breaking   | true
  Breaking changes (other)           | constrain  | schema-field  | breaking   | true
  Scheduled breaking changes         | deprecate  | endpoint      | notice     | false

Extraction rules:
1. Every release-note bullet with an FWD-XXXXX ticket becomes ONE change entry.
2. id = the FWD ticket ID verbatim.
3. description = the human-readable body, including any quoted field names.
4. When the bullet lists "METHOD /path" lines, emit RFC 6901 pointers like
   "#/paths/~1api~1collector-tasks/post". Multiple paths -> array.
5. When the bullet names a schema or field, emit
   "#/components/schemas/<Name>" or "#/components/schemas/<Name>/properties/<field>".
   Best-effort; fall back to "#/changelog/<bucket>/<ticket-id>" when unsure.
6. Parse sunset phrases like "will be removed in release 26.6" into lifecycle.reason.
7. tags[] should include the release-note category plus the product area
   (lowercase, dash-separated).
8. For breaking=true items, migration.client_action must be set.
9. Return a Changeset document with changeset_version "0.2" and api.from/to
   populated from the caller-supplied versions.`;

function stripBoilerplate(html: string): string {
  const article = html.match(/<article[\s\S]*?<\/article>/i);
  let body = article ? article[0] : html;
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "");
  body = body.replace(/<style[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  return body.replace(/\s+/g, " ").trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();

  // Diagnostic ping — no AI, no upstream fetch.
  if (typeof req.query.ping !== "undefined") {
    res.status(200).json({
      ok: true,
      method: req.method,
      env: { AI_GATEWAY_API_KEY: !!process.env.AI_GATEWAY_API_KEY },
      t: Date.now() - t0,
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "POST required" });
    return;
  }

  const { year, version, fromVersion, apiName = "Forward Networks API" } = (req.body ?? {}) as {
    year?: number; version?: string; fromVersion?: string; apiName?: string;
  };
  if (!year || !version) {
    res.status(400).json({ error: "year and version are required" });
    return;
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    res.status(500).json({ error: "AI_GATEWAY_API_KEY is not set in the deployment environment" });
    return;
  }

  let html: string;
  let released: string | undefined;
  try {
    const url = `https://docs.fwd.app/release-notes/api/${year}/release.${version}/`;
    const upstream = await fetch(url, { redirect: "follow" });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    html = await upstream.text();
    const m = html.match(/Released:\s*(\d{4}-\d{2}-\d{2})/);
    released = m ? m[1] : undefined;
  } catch (e: unknown) {
    res.status(502).json({ error: `release-notes fetch failed: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }

  const excerpt = stripBoilerplate(html);
  console.log(`[extract-changeset] excerpt=${excerpt.length} bytes, t+${Date.now() - t0}ms, calling generateObject...`);

  try {
    const { object } = await generateObject({
      model: "anthropic/claude-sonnet-4-6",
      schema: Changeset,
      abortSignal: AbortSignal.timeout(90_000),
      system: SYSTEM_PROMPT,
      prompt:
        `API name: ${apiName}\n` +
        `Previous version (from): ${fromVersion || "none"}\n` +
        `Target version (to): ${version}\n` +
        `Release date: ${released || "(not parsed)"}\n\n` +
        `Release-notes HTML (article only, scripts/styles stripped):\n\n${excerpt}\n\n` +
        `Emit a Changeset v0.2 document covering every FWD-ticketed change. ` +
        `Include the release date in "released". ` +
        `If no changes exist, return an empty changes array — do NOT fabricate entries.`,
    });
    console.log(`[extract-changeset] OK changes=${object.changes.length} t+${Date.now() - t0}ms`);
    res.status(200).json(object);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[extract-changeset] generateObject threw: ${msg}`);
    res.status(500).json({ error: `AI extraction failed: ${msg}` });
  }
}
