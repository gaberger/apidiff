// Primary adapter: HTTP server serving browser-based diff UI
// Imports only from ports

import type { WebServerPort, SpecInputPort } from "../../core/ports/index.js";
import type { DiffResult, MigrationGuide } from "../../core/domain/types.js";

type DiffHandler = (oldJson: unknown, newJson: unknown) => DiffResult[];
type GuideHandler = (
  oldJson: unknown,
  newJson: unknown,
  baseVersion: string,
  revisionVersion: string,
  sunsetDate?: string,
) => MigrationGuide;

export class WebAdapter implements WebServerPort {
  private server: ReturnType<typeof Bun.serve> | null = null;

  constructor(
    private readonly diffHandler: DiffHandler,
    private readonly guideHandler: GuideHandler,
    private readonly specInput?: SpecInputPort,
  ) {}

  async start(port: number): Promise<void> {
    this.server = Bun.serve({
      port,
      fetch: (req) => this.handleRequest(req),
    });
    console.log(`  apidiff web UI running at http://localhost:${port}`);
  }

  async stop(): Promise<void> {
    this.server?.stop();
    this.server = null;
  }

  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/api/diff") {
      return this.handleDiff(req);
    }

    if (req.method === "POST" && url.pathname === "/api/guide") {
      return this.handleGuide(req);
    }

    if (req.method === "POST" && url.pathname === "/api/fetch-spec") {
      return this.handleFetchSpec(req);
    }

    if (req.method === "POST" && url.pathname === "/api/parse-file") {
      return this.handleParseFile(req);
    }

    if (req.method === "GET" && url.pathname === "/api/samples") {
      return Response.json(SAMPLES);
    }

    // Provider version listing
    const versionsMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/versions$/);
    if (req.method === "GET" && versionsMatch) {
      return this.handleProviderVersions(versionsMatch[1]);
    }

    // Provider spec fetch
    const specMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/spec$/);
    if (req.method === "GET" && specMatch) {
      return this.handleProviderSpec(specMatch[1], url.searchParams.get("version") || "");
    }

    // Serve Vite-built frontend assets
    return this.serveStatic(url.pathname);
  }

  private async handleDiff(req: Request): Promise<Response> {
    try {
      const body = (await req.json()) as { old: unknown; new: unknown };
      const results = this.diffHandler(body.old, body.new);
      return Response.json(results);
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 400 });
    }
  }

  private async handleGuide(req: Request): Promise<Response> {
    try {
      const body = (await req.json()) as {
        old: unknown;
        new: unknown;
        baseVersion: string;
        revisionVersion: string;
        sunsetDate?: string;
      };
      const guide = this.guideHandler(
        body.old,
        body.new,
        body.baseVersion,
        body.revisionVersion,
        body.sunsetDate,
      );
      return Response.json(guide);
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 400 });
    }
  }

  private async handleFetchSpec(req: Request): Promise<Response> {
    if (!this.specInput) {
      return Response.json({ error: "Spec input not configured" }, { status: 501 });
    }
    try {
      const body = (await req.json()) as { url: string };
      const spec = await this.specInput.fromUrl(body.url);
      return Response.json(spec);
    } catch (e) {
      return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 });
    }
  }

  private async handleParseFile(req: Request): Promise<Response> {
    if (!this.specInput) {
      return Response.json({ error: "Spec input not configured" }, { status: 501 });
    }
    try {
      const body = (await req.json()) as { content: string; filename: string };
      const spec = await this.specInput.fromFile(body.content, body.filename);
      return Response.json(spec);
    } catch (e) {
      return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 });
    }
  }

  // Disk + memory cache: specs persist across restarts
  private specMemCache = new Map<string, unknown>();
  private versionCache = new Map<string, { versions: string[]; ts: number }>();
  private readonly VERSION_TTL = 5 * 60 * 1000; // 5 min
  private readonly CACHE_DIR = ".cache/specs";

  private async getCachedSpec(key: string): Promise<unknown | null> {
    if (this.specMemCache.has(key)) return this.specMemCache.get(key)!;
    try {
      const path = `${this.CACHE_DIR}/${key.replace(/[:/]/g, "_")}.json`;
      const file = Bun.file(path);
      if (await file.exists()) {
        const spec = await file.json();
        this.specMemCache.set(key, spec);
        return spec;
      }
    } catch { /* miss */ }
    return null;
  }

  private async setCachedSpec(key: string, spec: unknown): Promise<void> {
    this.specMemCache.set(key, spec);
    try {
      const path = `${this.CACHE_DIR}/${key.replace(/[:/]/g, "_")}.json`;
      await Bun.write(path, JSON.stringify(spec));
    } catch { /* best effort */ }
  }

  private async handleProviderVersions(providerId: string): Promise<Response> {
    const provider = PROVIDERS[providerId];
    if (!provider) return Response.json({ error: "Unknown provider" }, { status: 404 });
    try {
      // Check cache
      const cached = this.versionCache.get(providerId);
      if (cached && Date.now() - cached.ts < this.VERSION_TTL) {
        return Response.json({ provider: providerId, versions: cached.versions, cached: true });
      }
      let versions: string[];
      if (provider.versionsUrl) {
        // Custom version endpoint (e.g., Forward Networks)
        const res = await fetch(provider.versionsUrl, { headers: { "User-Agent": "apidiff" } });
        if (!res.ok) throw new Error(`Version fetch: ${res.status}`);
        const data = await res.json();
        versions = provider.parseVersions ? provider.parseVersions(data) : (data as string[]);
      } else if (provider.tagsUrl) {
        // GitHub tags
        const res = await fetch(provider.tagsUrl, {
          headers: { "Accept": "application/vnd.github+json", "User-Agent": "apidiff" },
        });
        if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
        const tags = (await res.json()) as Array<{ name: string }>;
        versions = tags
          .map((t) => t.name)
          .filter(provider.filter || (() => true))
          .slice(0, 30);
      } else {
        return Response.json({ error: "No version source configured" }, { status: 501 });
      }
      this.versionCache.set(providerId, { versions, ts: Date.now() });
      return Response.json({ provider: providerId, versions });
    } catch (e) {
      return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
    }
  }

  private async handleProviderSpec(providerId: string, version: string): Promise<Response> {
    const provider = PROVIDERS[providerId];
    if (!provider) return Response.json({ error: "Unknown provider" }, { status: 404 });
    if (!version) return Response.json({ error: "version parameter required" }, { status: 400 });
    try {
      const cacheKey = `${providerId}:${version}`;
      const cached = await this.getCachedSpec(cacheKey);
      if (cached) return Response.json(cached);
      const specUrl = provider.specUrl(version);
      const res = await fetch(specUrl, { headers: { "User-Agent": "apidiff" } });
      if (!res.ok) throw new Error(`Fetch spec: ${res.status} from ${specUrl}`);
      const spec = await res.json();
      await this.setCachedSpec(cacheKey, spec);
      return Response.json(spec);
    } catch (e) {
      return Response.json({ error: String(e instanceof Error ? e.message : e) }, { status: 502 });
    }
  }

  private static readonly FRONTEND_DIR = "dist/frontend";
  private static readonly MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".json": "application/json",
    ".woff2": "font/woff2",
  };

  private async serveStatic(pathname: string): Promise<Response> {
    const safePath = pathname.includes("..") ? "/" : pathname;
    const filePath = safePath === "/" || safePath === "/index.html"
      ? `${WebAdapter.FRONTEND_DIR}/index.html`
      : `${WebAdapter.FRONTEND_DIR}${safePath}`;

    const file = Bun.file(filePath);
    if (await file.exists()) {
      const ext = safePath.substring(safePath.lastIndexOf("."));
      const contentType = WebAdapter.MIME_TYPES[ext] || "application/octet-stream";
      const cacheControl = safePath === "/" || safePath.endsWith(".html")
        ? "no-cache, no-store, must-revalidate"
        : "public, max-age=31536000, immutable";
      return new Response(file, { headers: { "Content-Type": contentType, "Cache-Control": cacheControl } });
    }

    // SPA fallback — serve index.html for unmatched routes
    const indexFile = Bun.file(`${WebAdapter.FRONTEND_DIR}/index.html`);
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
      });
    }

    return new Response("Not Found — run 'vite build' first", { status: 404 });
  }
}

const SAMPLES = [
  {
    name: "Stripe Customer (v1 \u2192 v2)",
    description: "billing \u2192 collection_method rename, sources \u2192 payment_methods move, new invoice_settings",
    v1: {"id":"cus_NffrFeUfNV2Hib","object":"customer","billing":"charge_automatically","account_balance":0,"sources":{"object":"list","data":[],"has_more":false,"url":"/v1/customers/cus_NffrFeUfNV2Hib/sources"},"subscriptions":{"object":"list","data":[]},"created":1680893993,"email":"jenny@example.com","livemode":false,"metadata":{},"name":"Jenny Rosen","phone":null,"preferred_locales":[],"tax_exempt":"none"},
    v2: {"id":"cus_NffrFeUfNV2Hib","object":"customer","collection_method":"charge_automatically","balance":0,"payment_methods":{"object":"list","data":[],"has_more":false,"url":"/v1/customers/cus_NffrFeUfNV2Hib/payment_methods"},"subscriptions":{"object":"list","data":[]},"created":1680893993,"email":"jenny@example.com","livemode":false,"metadata":{},"name":"Jenny Rosen","phone":null,"preferred_locales":[],"tax_exempt":"none","invoice_settings":{"default_payment_method":null,"footer":null}},
  },
  {
    name: "Twilio Message (v1 \u2192 v2)",
    description: "price field type change (string \u2192 object), sid renamed, new subresource_uris",
    v1: {"sid":"SM123","account_sid":"AC456","from":"+15551234567","to":"+15559876543","body":"Hello!","status":"delivered","price":"-0.0075","price_unit":"USD","date_created":"2024-01-15T10:30:00Z","date_sent":"2024-01-15T10:30:01Z","error_code":null,"error_message":null,"num_segments":"1"},
    v2: {"message_sid":"SM123","account_sid":"AC456","from":"+15551234567","to":"+15559876543","body":"Hello!","status":"delivered","price":{"amount":-0.0075,"currency":"USD"},"date_created":"2024-01-15T10:30:00Z","date_sent":"2024-01-15T10:30:01Z","error_code":null,"error_message":null,"num_segments":1,"subresource_uris":{"media":"/2010-04-01/Accounts/AC456/Messages/SM123/Media.json"}},
  },
  {
    name: "GitHub User (v3 \u2192 v4 style)",
    description: "Nested fields restructured, new node_id, removed gravatar_id",
    v1: {"login":"octocat","id":1,"gravatar_id":"somehash","url":"https://api.github.com/users/octocat","type":"User","site_admin":false,"name":"The Octocat","company":"GitHub","blog":"https://github.blog","location":"San Francisco","email":"octocat@github.com","bio":"A cat that codes","public_repos":8,"followers":1000,"following":0,"created_at":"2008-01-14T04:33:35Z"},
    v2: {"login":"octocat","id":1,"node_id":"MDQ6VXNlcjE=","url":"https://api.github.com/users/octocat","type":"User","site_admin":false,"name":"The Octocat","company":"GitHub","blog":"https://github.blog","location":"San Francisco","email":"octocat@github.com","bio":"A cat that codes","public_repos":8,"followers":1000,"following":0,"created_at":"2008-01-14T04:33:35Z","twitter_username":"octocat"},
  },
];

interface Provider {
  tagsUrl?: string;
  versionsUrl?: string;
  specUrl: (version: string) => string;
  filter?: (tag: string) => boolean;
  parseVersions?: (data: unknown) => string[];
}

const PROVIDERS: Record<string, Provider> = {
  stripe: {
    tagsUrl: "https://api.github.com/repos/stripe/openapi/tags?per_page=50",
    specUrl: (v) => `https://raw.githubusercontent.com/stripe/openapi/${v}/openapi/spec3.json`,
    filter: (t) => /^v\d+$/.test(t),
  },
  github: {
    tagsUrl: "https://api.github.com/repos/github/rest-api-description/tags?per_page=50",
    specUrl: (v) => `https://raw.githubusercontent.com/github/rest-api-description/${v}/descriptions/api.github.com/api.github.com.json`,
    filter: (t) => /^v\d+\.\d+\.\d+$/.test(t),
  },
  twilio: {
    tagsUrl: "https://api.github.com/repos/twilio/twilio-oai/tags?per_page=50",
    specUrl: (v) => `https://raw.githubusercontent.com/twilio/twilio-oai/${v}/spec/json/twilio_api_v2010.json`,
    filter: (t) => /^\d+\.\d+\.\d+$/.test(t),
  },
  forward: {
    versionsUrl: "https://docs.fwd.app/versions.json",
    specUrl: (v) => {
      // 26.2+ uses /api/spec/, older uses /api-doc/api/spec/
      const parts = v.split(".").map(Number);
      const isNew = parts[0]! > 26 || (parts[0] === 26 && (parts[1] ?? 0) >= 2);
      return isNew
        ? `https://docs.fwd.app/${v}/api/spec/complete.json`
        : `https://docs.fwd.app/${v}/api-doc/api/spec/complete.json`;
    },
    parseVersions: (data) => {
      const d = data as { versions?: string[]; baseVersions?: string[] };
      return [...(d.versions || [])]
        .sort((a, b) => {
          const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
          return pb[0] - pa[0] || pb[1] - pa[1] || (pb[2] || 0) - (pa[2] || 0);
        });
    },
  },
};
