// Browser-side ChangelogParserPort that routes every fetch through the
// Vercel Function at /api/proxy-fetch — bypasses CORS for upstream
// changelog hosts (docs.fwd.app, stripe.com/docs, github.blog, etc.).
//
// Mirrors BrowserProxyAdapter's pattern: same proxy contract, same
// dedicated path. Regex set is duplicated from ChangelogParserAdapter
// (hex rule: adapters may not import other adapters).
//
// May only import from ports/ (never other adapters).

import type { ChangelogParserPort } from "../../core/ports/index.js";

const DEFAULT_PROXY_PATH = "/api/proxy-fetch";

const VERSION_PATTERNS = [
  /##\s+\[?(v?\d+\.\d+[\.\d]*)\]?/g,
  /\bversion\s+(v?\d+\.\d+[\.\d]*)\b/gi,
  /\brelease\s+(v?\d+\.\d+[\.\d]*)\b/gi,
  /\b(v\d+\.\d+[\.\d]*)\b/g,
];

const MAX_VERSIONS = 50;

export interface BrowserChangelogParserAdapterOptions {
  readonly proxyPath?: string;
}

interface ProxyResponse {
  readonly document: unknown;
  readonly contentType?: string;
  readonly status: number;
}

export class BrowserChangelogParserAdapter implements ChangelogParserPort {
  private readonly proxyPath: string;

  constructor(options: BrowserChangelogParserAdapterOptions = {}) {
    this.proxyPath = options.proxyPath ?? DEFAULT_PROXY_PATH;
  }

  async parse(url: string): Promise<string[]> {
    const proxyUrl = `${this.proxyPath}?url=${encodeURIComponent(url)}`;
    let body: ProxyResponse;
    try {
      const res = await globalThis.fetch(proxyUrl, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return [];
      body = (await res.json()) as ProxyResponse;
    } catch {
      return [];
    }

    if (body.status >= 400) return [];

    const text = typeof body.document === "string"
      ? body.document
      : JSON.stringify(body.document ?? "");

    const found = new Set<string>();
    for (const pattern of VERSION_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        if (match[1]) found.add(match[1]);
        if (found.size >= MAX_VERSIONS) break;
      }
      if (found.size >= MAX_VERSIONS) break;
    }
    return Array.from(found);
  }
}
