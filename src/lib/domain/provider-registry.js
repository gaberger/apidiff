// src/core/domain/provider-registry.ts
var PROVIDER_REGISTRY = [
  {
    name: "Stripe",
    slug: "stripe",
    category: "payments",
    specSource: { kind: "github", owner: "stripe", repo: "openapi" },
    changelogUrl: "https://stripe.com/docs/upgrades",
    docsUrl: "https://stripe.com/docs/api"
  },
  {
    name: "PayPal",
    slug: "paypal",
    category: "payments",
    specSource: { kind: "github", owner: "paypal", repo: "paypal-rest-api-specifications", path: "openapi" },
    docsUrl: "https://developer.paypal.com/docs/api/overview/"
  },
  {
    name: "Square",
    slug: "square",
    category: "payments",
    specSource: { kind: "github", owner: "square", repo: "connect-api-specification" },
    docsUrl: "https://developer.squareup.com/reference/square"
  },
  {
    name: "Adyen",
    slug: "adyen",
    category: "payments",
    specSource: { kind: "apis-guru", providerKey: "adyen.com" },
    docsUrl: "https://docs.adyen.com/api-explorer/"
  },
  {
    name: "Twilio",
    slug: "twilio",
    category: "communications",
    specSource: { kind: "github", owner: "twilio", repo: "twilio-oai" },
    changelogUrl: "https://www.twilio.com/changelog",
    docsUrl: "https://www.twilio.com/docs/usage/api"
  },
  {
    name: "SendGrid",
    slug: "sendgrid",
    category: "communications",
    specSource: { kind: "apis-guru", providerKey: "sendgrid.com" },
    docsUrl: "https://docs.sendgrid.com/api-reference"
  },
  {
    name: "Vonage (Nexmo)",
    slug: "vonage",
    category: "communications",
    specSource: { kind: "apis-guru", providerKey: "nexmo.com" },
    docsUrl: "https://developer.vonage.com/api"
  },
  {
    name: "GitHub",
    slug: "github",
    category: "developer-tools",
    specSource: { kind: "github", owner: "github", repo: "rest-api-description" },
    changelogUrl: "https://github.blog/changelog/",
    docsUrl: "https://docs.github.com/en/rest"
  },
  {
    name: "GitLab",
    slug: "gitlab",
    category: "developer-tools",
    specSource: { kind: "apis-guru", providerKey: "gitlab.com" },
    docsUrl: "https://docs.gitlab.com/ee/api/"
  },
  {
    name: "Jira (Atlassian)",
    slug: "jira",
    category: "developer-tools",
    specSource: { kind: "apis-guru", providerKey: "atlassian.com" },
    docsUrl: "https://developer.atlassian.com/cloud/jira/platform/rest/v3/"
  },
  {
    name: "PagerDuty",
    slug: "pagerduty",
    category: "developer-tools",
    specSource: { kind: "github", owner: "PagerDuty", repo: "api-schema" },
    docsUrl: "https://developer.pagerduty.com/api-reference/"
  },
  {
    name: "AWS",
    slug: "aws",
    category: "cloud",
    specSource: { kind: "apis-guru", providerKey: "amazonaws.com" },
    docsUrl: "https://docs.aws.amazon.com/"
  },
  {
    name: "Azure",
    slug: "azure",
    category: "cloud",
    specSource: { kind: "github", owner: "Azure", repo: "azure-rest-api-specs" },
    docsUrl: "https://learn.microsoft.com/en-us/rest/api/azure/"
  },
  {
    name: "Google Cloud",
    slug: "google-cloud",
    category: "cloud",
    specSource: { kind: "apis-guru", providerKey: "googleapis.com" },
    docsUrl: "https://cloud.google.com/apis"
  },
  {
    name: "DigitalOcean",
    slug: "digitalocean",
    category: "cloud",
    specSource: { kind: "github", owner: "digitalocean", repo: "openapi" },
    docsUrl: "https://docs.digitalocean.com/reference/api/"
  },
  {
    name: "Cloudflare",
    slug: "cloudflare",
    category: "cloud",
    specSource: { kind: "github", owner: "cloudflare", repo: "api-schemas" },
    docsUrl: "https://developers.cloudflare.com/api/"
  },
  {
    name: "Okta",
    slug: "okta",
    category: "identity",
    specSource: { kind: "github", owner: "okta", repo: "okta-management-openapi-spec", path: "dist" },
    docsUrl: "https://developer.okta.com/docs/reference/"
  },
  {
    name: "Slack",
    slug: "slack",
    category: "social",
    specSource: { kind: "apis-guru", providerKey: "slack.com" },
    docsUrl: "https://api.slack.com/methods"
  },
  {
    name: "Discord",
    slug: "discord",
    category: "social",
    specSource: { kind: "github", owner: "discord", repo: "discord-api-spec", path: "specs" },
    docsUrl: "https://discord.com/developers/docs"
  },
  {
    name: "OpenAI",
    slug: "openai",
    category: "ai",
    specSource: { kind: "url", specUrls: [
      { label: "current", url: "https://raw.githubusercontent.com/openai/openai-openapi/refs/heads/manual_spec/openapi.yaml" }
    ] },
    changelogUrl: "https://platform.openai.com/docs/changelog",
    docsUrl: "https://platform.openai.com/docs/api-reference"
  },
  {
    name: "Forward Networks",
    slug: "forward-networks",
    category: "infrastructure",
    specSource: { kind: "docusaurus", baseUrl: "https://docs.fwd.app" },
    changelogUrl: "https://docs.fwd.app/release-notes/api",
    docsUrl: "https://docs.fwd.app/latest/api/"
  }
];
function findProvider(slug) {
  const normalized = slug.toLowerCase().trim();
  return PROVIDER_REGISTRY.find((p) => p.slug === normalized || p.name.toLowerCase() === normalized);
}
function providersByCategory(category) {
  return PROVIDER_REGISTRY.filter((p) => p.category === category);
}
function allCategories() {
  return Array.from(new Set(PROVIDER_REGISTRY.map((p) => p.category)));
}
export {
  providersByCategory,
  findProvider,
  allCategories,
  PROVIDER_REGISTRY
};
