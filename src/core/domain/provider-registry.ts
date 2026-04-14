// Curated registry of popular API providers and their spec sources
// Zero external imports — pure domain knowledge

import type { ApiProvider } from "./discovery-types.js";

/**
 * Popular API providers with known OpenAPI spec locations.
 *
 * Selection criteria:
 * - Widely used (millions of integrations)
 * - Publishes versioned OpenAPI/Swagger specs
 * - Has publicly accessible spec files (GitHub repos or APIs.guru)
 *
 * Each entry points to the canonical source for that provider's specs.
 * GitHub sources are preferred when the provider maintains an official repo.
 */
export const PROVIDER_REGISTRY: readonly ApiProvider[] = [
  // ── Payments ──────────────────────────────────────────
  {
    name: "Stripe",
    slug: "stripe",
    category: "payments",
    specSource: { kind: "github", owner: "stripe", repo: "openapi" },
    changelogUrl: "https://stripe.com/docs/upgrades",
    docsUrl: "https://stripe.com/docs/api",
  },
  {
    name: "PayPal",
    slug: "paypal",
    category: "payments",
    specSource: { kind: "github", owner: "paypal", repo: "paypal-rest-api-specifications", path: "openapi" },
    docsUrl: "https://developer.paypal.com/docs/api/overview/",
  },
  {
    name: "Square",
    slug: "square",
    category: "payments",
    specSource: { kind: "github", owner: "square", repo: "connect-api-specification" },
    docsUrl: "https://developer.squareup.com/reference/square",
  },
  {
    name: "Adyen",
    slug: "adyen",
    category: "payments",
    specSource: { kind: "apis-guru", providerKey: "adyen.com" },
    docsUrl: "https://docs.adyen.com/api-explorer/",
  },

  // ── Communications ────────────────────────────────────
  {
    name: "Twilio",
    slug: "twilio",
    category: "communications",
    specSource: { kind: "github", owner: "twilio", repo: "twilio-oai" },
    changelogUrl: "https://www.twilio.com/changelog",
    docsUrl: "https://www.twilio.com/docs/usage/api",
  },
  {
    name: "SendGrid",
    slug: "sendgrid",
    category: "communications",
    specSource: { kind: "apis-guru", providerKey: "sendgrid.com" },
    docsUrl: "https://docs.sendgrid.com/api-reference",
  },
  {
    name: "Vonage (Nexmo)",
    slug: "vonage",
    category: "communications",
    specSource: { kind: "apis-guru", providerKey: "nexmo.com" },
    docsUrl: "https://developer.vonage.com/api",
  },

  // ── Developer Tools ───────────────────────────────────
  {
    name: "GitHub",
    slug: "github",
    category: "developer-tools",
    specSource: { kind: "github", owner: "github", repo: "rest-api-description" },
    changelogUrl: "https://github.blog/changelog/",
    docsUrl: "https://docs.github.com/en/rest",
  },
  {
    name: "GitLab",
    slug: "gitlab",
    category: "developer-tools",
    specSource: { kind: "apis-guru", providerKey: "gitlab.com" },
    docsUrl: "https://docs.gitlab.com/ee/api/",
  },
  {
    name: "Jira (Atlassian)",
    slug: "jira",
    category: "developer-tools",
    specSource: { kind: "apis-guru", providerKey: "atlassian.com" },
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/",
  },
  {
    name: "PagerDuty",
    slug: "pagerduty",
    category: "developer-tools",
    specSource: { kind: "github", owner: "PagerDuty", repo: "api-schema" },
    docsUrl: "https://developer.pagerduty.com/api-reference/",
  },

  // ── Cloud & Infrastructure ────────────────────────────
  {
    name: "AWS",
    slug: "aws",
    category: "cloud",
    specSource: { kind: "apis-guru", providerKey: "amazonaws.com" },
    docsUrl: "https://docs.aws.amazon.com/",
  },
  {
    name: "Azure",
    slug: "azure",
    category: "cloud",
    specSource: { kind: "github", owner: "Azure", repo: "azure-rest-api-specs" },
    docsUrl: "https://learn.microsoft.com/en-us/rest/api/azure/",
  },
  {
    name: "Google Cloud",
    slug: "google-cloud",
    category: "cloud",
    specSource: { kind: "apis-guru", providerKey: "googleapis.com" },
    docsUrl: "https://cloud.google.com/apis",
  },
  {
    name: "DigitalOcean",
    slug: "digitalocean",
    category: "cloud",
    specSource: { kind: "github", owner: "digitalocean", repo: "openapi" },
    docsUrl: "https://docs.digitalocean.com/reference/api/",
  },
  {
    name: "Cloudflare",
    slug: "cloudflare",
    category: "cloud",
    specSource: { kind: "github", owner: "cloudflare", repo: "api-schemas" },
    docsUrl: "https://developers.cloudflare.com/api/",
  },

  // ── Identity & Auth ───────────────────────────────────
  // Auth0 — no public OpenAPI spec published (repo doesn't exist)
  // Segment — no public OpenAPI spec published (repo doesn't exist)
  {
    name: "Okta",
    slug: "okta",
    category: "identity",
    specSource: { kind: "github", owner: "okta", repo: "okta-management-openapi-spec", path: "dist" },
    docsUrl: "https://developer.okta.com/docs/reference/",
  },

  // ── Social & Messaging ───────────────────────────────
  {
    name: "Slack",
    slug: "slack",
    category: "social",
    specSource: { kind: "apis-guru", providerKey: "slack.com" },
    docsUrl: "https://api.slack.com/methods",
  },
  {
    name: "Discord",
    slug: "discord",
    category: "social",
    specSource: { kind: "github", owner: "discord", repo: "discord-api-spec", path: "specs" },
    docsUrl: "https://discord.com/developers/docs",
  },

  // ── Commerce ──────────────────────────────────────────
  // Shopify — no public OpenAPI spec published

  // ── AI & ML ───────────────────────────────────────────
  {
    name: "OpenAI",
    slug: "openai",
    category: "ai",
    specSource: { kind: "url", specUrls: [
      { label: "current", url: "https://raw.githubusercontent.com/openai/openai-openapi/refs/heads/manual_spec/openapi.yaml" },
    ] },
    changelogUrl: "https://platform.openai.com/docs/changelog",
    docsUrl: "https://platform.openai.com/docs/api-reference",
  },

  // ── Infrastructure / Network Assurance ───────────────
  // Forward Networks publishes OpenAPI 3.1 specs per Docusaurus-docs version.
  // Versions advertised in https://docs.fwd.app/versions.json — but only recent
  // versions (26.2+) actually host /spec/complete.json; older versions return 404.
  // Per-section specs live at /<ver>/api/spec/<kebab-slug>.json (e.g. checks.json,
  // networks.json, nqe.json, path-search.json). Listed top-level "complete" specs
  // here; a dynamic Forward-discovery adapter can enumerate per-section URLs.
  {
    name: "Forward Networks",
    slug: "forward-networks",
    category: "infrastructure",
    specSource: { kind: "url", specUrls: [
      { label: "v26.3 · Complete",  url: "https://docs.fwd.app/26.3/api/spec/complete.json" },
      { label: "v26.2 · Complete",  url: "https://docs.fwd.app/26.2/api/spec/complete.json" },
      { label: "v26.3 · Checks",    url: "https://docs.fwd.app/26.3/api/spec/checks.json" },
      { label: "v26.2 · Checks",    url: "https://docs.fwd.app/26.2/api/spec/checks.json" },
      { label: "v26.3 · Networks",  url: "https://docs.fwd.app/26.3/api/spec/networks.json" },
      { label: "v26.2 · Networks",  url: "https://docs.fwd.app/26.2/api/spec/networks.json" },
      { label: "v26.3 · NQE",       url: "https://docs.fwd.app/26.3/api/spec/nqe.json" },
      { label: "v26.2 · NQE",       url: "https://docs.fwd.app/26.2/api/spec/nqe.json" },
      { label: "v26.3 · Aliases",   url: "https://docs.fwd.app/26.3/api/spec/aliases.json" },
      { label: "v26.2 · Aliases",   url: "https://docs.fwd.app/26.2/api/spec/aliases.json" },
      { label: "v26.3 · Credentials", url: "https://docs.fwd.app/26.3/api/spec/credentials.json" },
      { label: "v26.2 · Credentials", url: "https://docs.fwd.app/26.2/api/spec/credentials.json" },
      { label: "v26.3 · Path Search", url: "https://docs.fwd.app/26.3/api/spec/path-search.json" },
    ] },
    docsUrl: "https://docs.fwd.app/latest/api/",
  },
] as const;

/** Lookup a provider by slug (case-insensitive) */
export function findProvider(slug: string): ApiProvider | undefined {
  const normalized = slug.toLowerCase().trim();
  return PROVIDER_REGISTRY.find(
    (p) => p.slug === normalized || p.name.toLowerCase() === normalized,
  );
}

/** List providers by category */
export function providersByCategory(category: string): ApiProvider[] {
  return PROVIDER_REGISTRY.filter((p) => p.category === category);
}

/** Get all unique categories */
export function allCategories(): string[] {
  return Array.from(new Set(PROVIDER_REGISTRY.map((p) => p.category)));
}
