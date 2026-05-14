// Vercel Function — server-side URL proxy for CORS-restricted OpenAPI specs.
// Accepts GET /api/proxy-fetch?url=<encoded-url> and returns
// { document, contentType, status } as JSON. `document` is a parsed object
// when the upstream content-type is JSON, otherwise the raw string.
//
// SSRF guard (api/_lib/ssrf-guard.ts) blocks private/loopback/link-local/metadata
// targets and revalidates every redirect hop. Keep the guard authoritative — do
// not call fetch() directly here.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { safeFetch } from "./_lib/ssrf-guard.js";

function parseDocument(raw: string, contentType: string | null): unknown {
  const ct = (contentType ?? "").toLowerCase();
  const looksJson = ct.includes("json") || raw.trimStart().startsWith("{") || raw.trimStart().startsWith("[");
  if (looksJson) {
    try { return JSON.parse(raw); } catch { /* fall through to string */ }
  }
  return raw;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const target = typeof req.query.url === "string" ? req.query.url : Array.isArray(req.query.url) ? req.query.url[0] : undefined;
  if (!target) {
    res.status(400).json({ error: "missing url query parameter" });
    return;
  }

  const result = await safeFetch(target);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  const contentType = result.response.headers.get("content-type") ?? undefined;
  const raw = await result.response.text();
  res.status(200).json({
    document: parseDocument(raw, contentType ?? null),
    contentType,
    status: result.response.status,
  });
}
