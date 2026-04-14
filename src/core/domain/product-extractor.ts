// Pure domain — extract an ApiProduct grouping key from a spec URL/label.
// Zero external imports. Used by primary adapters (UI grouping) and optionally
// by secondary adapters (to annotate DiscoveredVersion at discovery time).

export interface ApiProduct {
  readonly key: string;   // stable identifier, lowercase, url-safe
  readonly name: string;  // human-readable label
}

/**
 * Derive a product grouping from a spec URL + label + provider slug.
 *
 * Returns `undefined` when the provider is single-product (Stripe, OpenAI, etc.)
 * — callers should treat that as "show flat version list, no grouping".
 */
export function extractProduct(
  url: string,
  label: string,
  providerSlug: string,
): ApiProduct | undefined {
  const slug = (providerSlug || "").toLowerCase();
  const safeUrl = url || "";
  const safeLabel = label || "";

  // ── Twilio: spec/json/twilio_<product>_v<N>.json
  // Examples:
  //   twilio_api_v2010.json           → product=api (core messaging/voice API)
  //   twilio_messaging_v1.json        → product=messaging
  //   twilio_flex_v2.json             → product=flex
  //   twilio_taskrouter_v1.json       → product=taskrouter
  //   twilio_conversations_v1.json    → product=conversations
  if (slug === "twilio" || /twilio-oai/i.test(safeUrl)) {
    const m = safeUrl.match(/twilio_([a-z0-9]+)_v[0-9]+/i);
    const seg = m?.[1];
    if (seg) return { key: seg.toLowerCase(), name: prettyTwilio(seg) };
  }

  // ── GitHub REST: descriptions/{api.github.com|ghes-3.x|ghec}/*
  // Match by slug OR by URL shape so custom-named integrations (e.g.,
  // "github-rest", "GitHub") still get the right deployment-variant grouping
  // instead of falling through to the generic matcher.
  const looksLikeGitHubRest = /rest-api-description\//i.test(safeUrl) ||
    /descriptions(?:-next)?\/(api\.github\.com|ghec|ghes-\d+\.\d+)\//i.test(safeUrl);
  if (slug === "github" || looksLikeGitHubRest) {
    const m = safeUrl.match(/descriptions(?:-next)?\/([^/]+)\//i);
    const seg = m?.[1];
    if (seg) return { key: seg.toLowerCase(), name: prettyGitHub(seg) };
  }

  // ── Azure: specification/<service>/resource-manager/... or data-plane/...
  if (slug === "azure") {
    const m = safeUrl.match(/specification\/([^/]+)\//i);
    const seg = m?.[1];
    if (seg) return { key: seg.toLowerCase(), name: titleCase(seg) };
  }

  // ── Google Cloud / APIs.guru shape: <provider>/<service>/<version>/swagger.json
  if (slug === "google-cloud" || /googleapis\.com/i.test(safeUrl)) {
    const m = safeUrl.match(/googleapis\.com\/([^/]+)\//i);
    const seg = m?.[1];
    if (seg) return { key: seg.toLowerCase(), name: titleCase(seg) };
  }

  // ── Cloudflare: api-schemas has per-product directories
  if (slug === "cloudflare") {
    const m = safeUrl.match(/api-schemas\/([^/]+)\//i);
    const seg = m?.[1];
    if (seg) return { key: seg.toLowerCase(), name: titleCase(seg) };
  }

  // ── Forward Networks: docs.fwd.app/<ver>/api/spec/<section>.json
  // Section slug is kebab-case (checks, networks, nqe, path-search, ...).
  // "complete" is the full combined spec — group it separately as "All sections".
  if (slug === "forward-networks" || /docs\.fwd\.app/i.test(safeUrl)) {
    const m = safeUrl.match(/\/api\/spec\/([a-z0-9-]+)\.(?:json|ya?ml)$/i);
    const seg = m?.[1];
    if (seg) {
      const section = seg.toLowerCase();
      if (section === "complete") return { key: "complete", name: "All sections (combined)" };
      return { key: section, name: titleCase(section) };
    }
  }

  // ── Generic fallback: directory name immediately above the spec file.
  // Only applied when the URL has a recognizable spec/openapi/api segment — otherwise
  // return undefined and let the UI render a flat list.
  const dirMatch = safeUrl.match(/\/([^/]+)\/[^/]+\.(?:json|ya?ml)$/i);
  const dirSegment = dirMatch?.[1];
  if (dirSegment && dirSegment.length > 0 && !isGenericDirName(dirSegment)) {
    return { key: dirSegment.toLowerCase(), name: titleCase(dirSegment) };
  }

  // Try the label: "Messaging v1" → messaging
  const labelMatch = safeLabel.match(/^([A-Za-z][A-Za-z0-9_-]+)\s+v[0-9]/);
  const labelSegment = labelMatch?.[1];
  if (labelSegment) {
    return { key: labelSegment.toLowerCase(), name: titleCase(labelSegment) };
  }

  return undefined;
}

/**
 * Group a list of versions by product. Returns a single "All versions" group with
 * key "" when fewer than 2 distinct products are present (single-product provider).
 */
export function groupByProduct<T extends { url: string; label: string }>(
  versions: readonly T[],
  providerSlug: string,
): readonly { readonly product: ApiProduct | undefined; readonly versions: readonly T[] }[] {
  const byKey = new Map<string, { product: ApiProduct | undefined; versions: T[] }>();
  for (const v of versions) {
    const product = extractProduct(v.url, v.label, providerSlug);
    const key = product?.key ?? "";
    if (!byKey.has(key)) byKey.set(key, { product, versions: [] });
    byKey.get(key)!.versions.push(v);
  }
  if (byKey.size < 2) {
    return [{ product: undefined, versions: [...versions] }];
  }
  return Array.from(byKey.values()).sort((a, b) =>
    (a.product?.name ?? "zzz").localeCompare(b.product?.name ?? "zzz"),
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function prettyTwilio(key: string): string {
  const map: Record<string, string> = {
    api: "Core API (Messaging/Voice)",
    messaging: "Messaging",
    voice: "Voice",
    video: "Video",
    chat: "Chat",
    conversations: "Conversations",
    studio: "Studio",
    verify: "Verify",
    taskrouter: "TaskRouter",
    flex: "Flex",
    ipmessaging: "IP Messaging",
    lookups: "Lookups",
    notify: "Notify",
    pricing: "Pricing",
    proxy: "Proxy",
    monitor: "Monitor",
    numbers: "Numbers",
    events: "Events",
    serverless: "Serverless",
    routes: "Routes",
    wireless: "Wireless",
    supersim: "Super SIM",
    trunking: "Trunking",
    insights: "Insights",
    sync: "Sync",
    bulkexports: "Bulk Exports",
    autopilot: "Autopilot",
    content: "Content",
    frontline: "Frontline API",
    oauth: "OAuth",
    accounts: "Accounts",
    messaging_v1: "Messaging v1",
  };
  return map[key.toLowerCase()] ?? titleCase(key);
}

function prettyGitHub(key: string): string {
  const lc = key.toLowerCase();
  if (lc === "api.github.com") return "github.com (SaaS)";
  if (lc === "ghec") return "Enterprise Cloud";
  const ghes = lc.match(/^ghes-(\d+\.\d+)$/);
  if (ghes) return `Enterprise Server ${ghes[1]}`;
  return titleCase(key);
}

function titleCase(s: string): string {
  return s
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function isGenericDirName(name: string): boolean {
  const lc = name.toLowerCase();
  const generic = new Set([
    // Structural / build directories
    "openapi", "spec", "specs", "api", "apis", "schema", "schemas", "dist", "json", "yaml", "yml", "src", "descriptions", "descriptions-next", "docs", "doc",
    // Release channels (these are NOT products — they are rollout stages)
    "latest", "preview", "stable", "edge", "next", "main", "master", "beta", "alpha", "rc", "nightly", "canary", "experimental", "current",
  ]);
  if (generic.has(lc)) return true;
  // Version-shaped directory names are NOT products — they are versions.
  if (/^\d{4}-\d{2}-\d{2}/.test(lc)) return true;
  if (/^v?\d+(\.\d+){0,2}$/.test(lc)) return true;
  if (/^\d{4}$/.test(lc)) return true;
  return false;
}
