// Vercel Function — server-side URL proxy for CORS-restricted OpenAPI specs.
// Accepts GET /api/proxy-fetch?url=<encoded-url> and returns
// { document, contentType, status } as JSON. `document` is a parsed object
// when the upstream content-type is JSON, otherwise the raw string.

import type { VercelRequest, VercelResponse } from "@vercel/node";

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

  let parsed: URL;
  try { parsed = new URL(target); } catch {
    res.status(400).json({ error: "invalid url" });
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).json({ error: "only http/https urls are allowed" });
    return;
  }

  try {
    const upstream = await fetch(parsed.toString(), { redirect: "follow" });
    const contentType = upstream.headers.get("content-type") ?? undefined;
    const raw = await upstream.text();
    res.status(200).json({
      document: parseDocument(raw, contentType ?? null),
      contentType,
      status: upstream.status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown fetch error";
    res.status(502).json({ error: `upstream fetch failed: ${msg}` });
  }
}
