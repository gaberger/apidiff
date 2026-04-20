// Vercel Function (Fluid Compute, Node.js runtime).
// Per ADR-020: server-side URL proxy for CORS-restricted OpenAPI specs.
// Accepts GET /api/proxy-fetch?url=<encoded-url> and returns
// { document, contentType, status } as JSON. `document` is a parsed object
// when the upstream content-type is JSON, otherwise the raw string.

export const config = { runtime: "nodejs" };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function parseDocument(raw: string, contentType: string | null): unknown {
  const ct = (contentType ?? "").toLowerCase();
  const looksJson = ct.includes("json") || raw.trimStart().startsWith("{") || raw.trimStart().startsWith("[");
  if (looksJson) {
    try { return JSON.parse(raw); } catch { /* fall through to string */ }
  }
  return raw;
}

export default async function handler(req: Request): Promise<Response> {
  const reqUrl = new URL(req.url);
  const target = reqUrl.searchParams.get("url");
  if (!target) return jsonResponse({ error: "missing url query parameter" }, { status: 400 });

  let parsed: URL;
  try { parsed = new URL(target); } catch { return jsonResponse({ error: "invalid url" }, { status: 400 }); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return jsonResponse({ error: "only http/https urls are allowed" }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString(), { redirect: "follow" });
    const contentType = upstream.headers.get("content-type") ?? undefined;
    const raw = await upstream.text();
    return jsonResponse({
      document: parseDocument(raw, contentType ?? null),
      contentType,
      status: upstream.status,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown fetch error";
    return jsonResponse({ error: `upstream fetch failed: ${msg}` }, { status: 502 });
  }
}
