// AI-powered Changeset extractor (Vercel Function, Node.js runtime).
//
// Accepts { year, version } and returns a Changeset v0.2 document derived
// from the Forward Networks release-notes page for that version. Uses
// Vercel AI Gateway with Anthropic Claude via structured output.
// Requires AI_GATEWAY_API_KEY in the Vercel project env (the SDK picks
// it up automatically and routes "anthropic/..." strings through the
// gateway).

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
  "RFC 6901 JSON Pointer into the OpenAPI spec, e.g. '#/paths/~1api~1orders/post' " +
  "or '#/components/schemas/Order'. Use '~1' to escape '/' and '~0' to escape '~'. " +
  "Prefer real spec paths when the release note cites one. Only use " +
  "'#/changelog/<bucket>/<FWD-ticket>' when the note gives no resolvable path.",
);

const Change = z.object({
  id: z.string().describe("Stable identifier. Prefer the FWD ticket ID verbatim (e.g. 'FWD-50059')."),
  op: OP,
  target: TARGET,
  severity: SEVERITY,
  breaking: z.boolean().optional(),
  detectable: z.boolean().optional().describe("False for semantic-family ops that can't be diffed from OpenAPI documents."),
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
  released: z.string().optional().describe("Release date in YYYY-MM-DD from the release-notes page."),
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
2. id = the FWD ticket ID verbatim (e.g. "FWD-50059").
3. description = the human-readable body of the bullet, including any quoted field names.
4. When the bullet lists one or more "METHOD /path" lines, emit RFC 6901 pointers
   like "#/paths/~1api~1collector-tasks/post". Multiple paths -> array.
5. When the bullet names a schema or field, emit "#/components/schemas/<Name>" or
   "#/components/schemas/<Name>/properties/<field>". Best-effort; if you can't
   construct a real pointer, fall back to "#/changelog/<bucket>/<ticket-id>".
6. Parse sunset phrases like "will be removed in release 26.6" into lifecycle.reason
   (e.g. "Scheduled for removal in release 26.6").
7. tags[] should include the release-note category (new-operation, model-change,
   scheduled-deprecation, ...) plus the area/product name (lowercase, dash-separated).
8. For breaking=true items, migration.client_action must be set to actionable
   guidance for consumers.
9. Return a complete Changeset document with changeset_version "0.2" and the
   api.from/api.to block populated from the caller-supplied versions.`;

async function fetchReleaseNotes(year: number, version: string): Promise<{ html: string; released?: string }> {
  const url = `https://docs.fwd.app/release-notes/api/${year}/release.${version}/`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Upstream ${res.status} fetching ${url}`);
  const html = await res.text();
  const m = html.match(/Released:\s*(\d{4}-\d{2}-\d{2})/);
  return { html, released: m ? m[1] : undefined };
}

function stripBoilerplate(html: string): string {
  // Keep only the <article> contents if present, then strip scripts/styles.
  const article = html.match(/<article[\s\S]*?<\/article>/i);
  let body = article ? article[0] : html;
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "");
  body = body.replace(/<style[\s\S]*?<\/style>/gi, "");
  body = body.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  // Collapse aggressive whitespace to cut tokens.
  return body.replace(/\s+/g, " ").trim();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const t0 = Date.now();
  console.log("[extract-changeset] start", req.method, req.url);
  // Diagnostic path — no AI, no fetch. Proves module loaded + handler reached.
  if (new URL(req.url).searchParams.has("ping")) {
    return json({
      ok: true,
      method: req.method,
      env: {
        AI_GATEWAY_API_KEY: !!process.env.AI_GATEWAY_API_KEY,
        VERCEL_OIDC_TOKEN: !!process.env.VERCEL_OIDC_TOKEN,
        VERCEL_ENV: process.env.VERCEL_ENV,
      },
      t: Date.now() - t0,
    });
  }
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  let input: { year?: number; version?: string; fromVersion?: string; apiName?: string; debug?: boolean };
  try {
    input = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const { year, version, fromVersion, apiName = "Forward Networks API", debug } = input;
  if (!year || !version) return json({ error: "year and version are required" }, 400);
  console.log(`[extract-changeset] input year=${year} version=${version} from=${fromVersion} debug=${!!debug}`);
  console.log(`[extract-changeset] env AI_GATEWAY_API_KEY=${process.env.AI_GATEWAY_API_KEY ? "set" : "UNSET"} VERCEL_OIDC_TOKEN=${process.env.VERCEL_OIDC_TOKEN ? "set" : "UNSET"}`);

  let html: string;
  let released: string | undefined;
  try {
    ({ html, released } = await fetchReleaseNotes(year, version));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `release-notes fetch failed: ${msg}` }, 502);
  }

  const excerpt = stripBoilerplate(html);
  console.log(`[extract-changeset] release notes fetched bytes=${html.length} excerpt=${excerpt.length} t+${Date.now() - t0}ms`);

  if (debug) {
    return json({ debug: true, excerptSample: excerpt.slice(0, 500), excerptLength: excerpt.length, released });
  }

  try {
    if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
      return json({ error: "AI_GATEWAY_API_KEY is not set in the deployment environment" }, 500);
    }
    console.log("[extract-changeset] calling generateObject...");
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
        `Emit a Changeset v0.2 document covering every FWD-ticketed change in the notes. ` +
        `Include the release date in the top-level "released" field. ` +
        `If the section is empty, return an empty changes array — do NOT fabricate entries.`,
    });
    console.log(`[extract-changeset] generateObject OK changes=${object?.changes?.length ?? 0} t+${Date.now() - t0}ms`);
    return json(object);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[extract-changeset] generateObject threw: ${msg}`);
    return json({ error: `AI extraction failed: ${msg}` }, 500);
  }
}
