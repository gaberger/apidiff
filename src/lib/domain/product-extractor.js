// src/core/domain/product-extractor.ts
function extractProduct(url, label, providerSlug) {
  const slug = (providerSlug || "").toLowerCase();
  const safeUrl = url || "";
  const safeLabel = label || "";
  if (slug === "twilio" || /twilio-oai/i.test(safeUrl)) {
    const m = safeUrl.match(/twilio_([a-z0-9]+)_v[0-9]+/i);
    if (m)
      return { key: m[1].toLowerCase(), name: prettyTwilio(m[1]) };
  }
  if (slug === "github") {
    const m = safeUrl.match(/descriptions(?:-next)?\/([^/]+)\//i);
    if (m)
      return { key: m[1].toLowerCase(), name: prettyGitHub(m[1]) };
  }
  if (slug === "azure") {
    const m = safeUrl.match(/specification\/([^/]+)\//i);
    if (m)
      return { key: m[1].toLowerCase(), name: titleCase(m[1]) };
  }
  if (slug === "google-cloud" || /googleapis\.com/i.test(safeUrl)) {
    const m = safeUrl.match(/googleapis\.com\/([^/]+)\//i);
    if (m)
      return { key: m[1].toLowerCase(), name: titleCase(m[1]) };
  }
  if (slug === "cloudflare") {
    const m = safeUrl.match(/api-schemas\/([^/]+)\//i);
    if (m)
      return { key: m[1].toLowerCase(), name: titleCase(m[1]) };
  }
  if (slug === "forward-networks" || /docs\.fwd\.app/i.test(safeUrl)) {
    const m = safeUrl.match(/\/api\/spec\/([a-z0-9-]+)\.(?:json|ya?ml)$/i);
    if (m) {
      const section = m[1].toLowerCase();
      if (section === "complete")
        return { key: "complete", name: "All sections (combined)" };
      return { key: section, name: titleCase(section) };
    }
  }
  const dirMatch = safeUrl.match(/\/([^/]+)\/[^/]+\.(?:json|ya?ml)$/i);
  if (dirMatch && dirMatch[1].length > 0 && !isGenericDirName(dirMatch[1])) {
    return { key: dirMatch[1].toLowerCase(), name: titleCase(dirMatch[1]) };
  }
  const labelMatch = safeLabel.match(/^([A-Za-z][A-Za-z0-9_-]+)\s+v[0-9]/);
  if (labelMatch) {
    return { key: labelMatch[1].toLowerCase(), name: titleCase(labelMatch[1]) };
  }
  return;
}
function groupByProduct(versions, providerSlug) {
  const byKey = new Map;
  for (const v of versions) {
    const product = extractProduct(v.url, v.label, providerSlug);
    const key = product?.key ?? "";
    if (!byKey.has(key))
      byKey.set(key, { product, versions: [] });
    byKey.get(key).versions.push(v);
  }
  if (byKey.size < 2) {
    return [{ product: undefined, versions: [...versions] }];
  }
  return Array.from(byKey.values()).sort((a, b) => (a.product?.name ?? "zzz").localeCompare(b.product?.name ?? "zzz"));
}
function prettyTwilio(key) {
  const map = {
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
    messaging_v1: "Messaging v1"
  };
  return map[key.toLowerCase()] ?? titleCase(key);
}
function prettyGitHub(key) {
  const lc = key.toLowerCase();
  if (lc === "api.github.com")
    return "github.com (SaaS)";
  if (lc === "ghec")
    return "Enterprise Cloud";
  const ghes = lc.match(/^ghes-(\d+\.\d+)$/);
  if (ghes)
    return `Enterprise Server ${ghes[1]}`;
  return titleCase(key);
}
function titleCase(s) {
  return s.replace(/[-_]+/g, " ").split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function isGenericDirName(name) {
  const generic = new Set(["openapi", "spec", "specs", "api", "apis", "schema", "schemas", "dist", "json", "yaml", "src"]);
  return generic.has(name.toLowerCase());
}
export {
  groupByProduct,
  extractProduct
};
