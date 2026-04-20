// Browser-side SpecProxyPort implementation.
// Per ADR-020 fetches a spec directly (fastest, no server hop); on CORS
// failure falls back to a server-side proxy endpoint served by a Vercel
// Function at /api/proxy-fetch.

import type { ProxyFetchResult } from "../../core/domain/types.js";
import type { SpecProxyPort } from "../../core/ports/index.js";

export interface BrowserProxyAdapterOptions {
  /** Relative path to the server-side proxy endpoint. */
  readonly proxyPath?: string;
  /** If true, skip the direct fetch attempt and always use the proxy. */
  readonly alwaysProxy?: boolean;
}

const DEFAULT_PROXY_PATH = "/api/proxy-fetch";

function parseDocument(raw: string, contentType: string | null): unknown {
  const ct = (contentType || "").toLowerCase();
  const looksJson = ct.includes("json") || raw.trimStart().startsWith("{") || raw.trimStart().startsWith("[");
  if (looksJson) {
    try { return JSON.parse(raw); } catch { /* fall through to string */ }
  }
  return raw;
}

export class BrowserProxyAdapter implements SpecProxyPort {
  private readonly proxyPath: string;
  private readonly alwaysProxy: boolean;

  constructor(opts: BrowserProxyAdapterOptions = {}) {
    this.proxyPath = opts.proxyPath ?? DEFAULT_PROXY_PATH;
    this.alwaysProxy = opts.alwaysProxy ?? false;
  }

  async fetch(url: string): Promise<ProxyFetchResult> {
    if (!this.alwaysProxy) {
      try {
        const res = await globalThis.fetch(url, { redirect: "follow" });
        if (res.ok) {
          const contentType = res.headers.get("content-type") ?? undefined;
          const raw = await res.text();
          return {
            document: parseDocument(raw, contentType ?? null),
            contentType,
            status: res.status,
          };
        }
      } catch {
        // Typical CORS failure surfaces as TypeError — fall through to proxy.
      }
    }

    const proxyUrl = `${this.proxyPath}?url=${encodeURIComponent(url)}`;
    const res = await globalThis.fetch(proxyUrl);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Proxy fetch failed (${res.status}): ${body || res.statusText}`);
    }
    const payload = await res.json() as { document: unknown; contentType?: string; status?: number; error?: string };
    if (payload.error) throw new Error(payload.error);
    return {
      document: payload.document,
      contentType: payload.contentType,
      status: payload.status ?? res.status,
    };
  }
}
