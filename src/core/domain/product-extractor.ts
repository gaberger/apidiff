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
    if (m) return { key: m[1].toLowerCase(), name: prettyTwilio(m[1]) };
  }

  // ── GitHub REST: descriptions/{api.github.com|ghes-3.x|ghec}/*
  if (slug === "github") {
    const m = safeUrl.match(/descriptions(?:-next)?\/([^/]+)\//i);
    if (m) return { key: m[1].toLowerCase(), name: prettyGitHub(m[1]) };
  }

  // ── Azure: specification/<service>/resource-manager/... or data-plane/...
  if (slug === "azure") {
    const m = safeUrl.match(/specification\/([^/]+)\//i);
    if (m) return { key: m[1].toLowerCase(), name: titleCase(m[1]) };
  }

  // ── Google Cloud / APIs.guru shape: <provider>/<service>/<version>/swagger.json
  if (slug === "google-cloud" || /googleapis\.com/i.test(safeUrl)) {
    const m = safeUrl.match(/googleapis\.com\/([^/]+)\//i);
    if (m) return { key: m[1].toLowerCase(), name: titleCase(m[1]) };
  }

  // ── Cloudflare: api-schemas has per-product directories
  if (slug === "cloudflare") {
    const m = safeUrl.match(/api-schemas\/([^/]+)\//i);
    if (m) return { key: m[1].toLowerCase(), name: titleCase(m[1]) };
  }

  // ── Generic fallback: directory name immediately above the spec file.
  // Only applied when the URL has a recognizable spec/openapi/api segment — otherwise
  // return undefined and let the UI render a flat list.
  const dirMatch = safeUrl.match(/\/([^/]+)\/[^/]+\.(?:json|ya?ml)$/i);
  if (dirMatch && dirMatch[1].length > 0 && !isGenericDirName(dirMatch[1])) {
    return { key: dirMatch[1].toLowerCase(), name: titleCase(dirMatch[1]) };
  }

  // Try the label: "Messaging v1" → messaging
  const labelMatch = safeLabel.match(/^([A-Za-z][A-Za-z0-9_-]+)\s+v[0-9]/);
  if (labelMatch) {
    return { key: labelMatch[1].toLowerCase(), name: titleCase(labelMatch[1]) };
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
  const generic = new Set(["openapi", "spec", "specs", "api", "apis", "schema", "schemas", "dist", "json", "yaml", "src"]);
  return generic.has(name.toLowerCase());
}
