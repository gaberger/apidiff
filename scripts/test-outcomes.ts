// test-outcomes.ts
//
// Measures apidiff against live, real-world inputs and writes the results to
// src/data/test-outcomes.json, which the site's Testing page displays. Every
// number on that page comes from this script, so anyone can rerun it.
//
// Usage: bun scripts/test-outcomes.ts
//
// Needs network access. The schema checks also need oasdiff on PATH; without
// it they are recorded as skipped, not as failures.

import { join } from "node:path";
import { parseHtml, buildChangeset } from "../src/core/domain/release-notes-changeset.js";
import { segmentReleaseNotes } from "../src/core/domain/release-notes-segment.js";
import { createCliApp } from "../src/composition-root.js";

const ROOT = join(import.meta.dir, "..");
const OUT = join(ROOT, "src", "data", "test-outcomes.json");

const FORWARD_RELEASES = ["26.1", "26.2", "26.3", "26.4", "26.5", "26.6", "26.7", "26.8", "26.9", "26.10"];
const forwardUrl = (v: string) => `https://docs.fwd.app/release-notes/api/2026/release.${v}.0/`;

// Release-notes pages from other vendors, each laid out differently.
const VENDORS: { name: string; url: string }[] = [
  { name: "Stripe", url: "https://docs.stripe.com/changelog/basil" },
  { name: "GitHub", url: "https://docs.github.com/en/rest/about-the-rest-api/breaking-changes" },
  { name: "Slack", url: "https://docs.slack.dev/changelog" },
  { name: "Atlassian Jira", url: "https://developer.atlassian.com/cloud/jira/platform/changelog/" },
  { name: "Okta", url: "https://developer.okta.com/docs/release-notes/2025-okta-identity-engine/" },
  { name: "NetBox", url: "https://netboxlabs.com/docs/netbox/release-notes/version-4.3/" },
  { name: "Twilio", url: "https://www.twilio.com/en-us/changelog" },
  { name: "PagerDuty", url: "https://developer.pagerduty.com/docs/changelog" },
  { name: "Microsoft Graph", url: "https://learn.microsoft.com/en-us/graph/whats-new-overview" },
];

// Pages that render their content with JavaScript: a plain fetch gets no items.
const NOT_FETCHABLE: { name: string; url: string; reason: string }[] = [
  { name: "Shopify", url: "https://shopify.dev/docs/api/release-notes/2025-07", reason: "Content is rendered by JavaScript. Use --raw-html with a saved, rendered page." },
  { name: "Cisco Meraki", url: "https://developer.cisco.com/meraki/whats-new/", reason: "Content is rendered by JavaScript. Use --raw-html with a saved, rendered page." },
];

const SCHEMA_PAIRS = [
  { from: "26.3", to: "26.4", expect: "breaking", note: "Forward changed createdAt from an integer to a string in 26.4." },
  { from: "26.8", to: "26.9", expect: "clean", note: "26.9 only deprecated and added; nothing breaking." },
];
const forwardSpec = (v: string) => `https://docs.fwd.app/${v}/api/spec/complete.json`;

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "apidiff" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function sh(cmd: string[]): { out: string; code: number } {
  const p = Bun.spawnSync(cmd, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return { out: p.stdout.toString() + p.stderr.toString(), code: p.exitCode ?? 1 };
}

const plain = (s: string) => s.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ").replace(/[^\w ]/g, "").replace(/\s+/g, " ").trim();

/**
 * A check per page that does not use the segmenter's own audit: something a
 * reader of the page would count by hand (change links, headings, tickets).
 */
function independentCheck(name: string, html: string, r: ReturnType<typeof segmentReleaseNotes>) {
  const segs = r.segments;
  if (name === "Stripe") {
    const want = new Set([...html.matchAll(/href="(\/changelog\/basil\/[^"#]+)"/g)].map((m) => m[1]!));
    const got = new Set(segs.flatMap((s) => s.links));
    return { what: "change entries linked", found: [...want].filter((l) => got.has(l)).length, total: want.size };
  }
  if (name === "Slack") {
    // Each <article> is one post; its first heading is the post title.
    const titles = [...html.matchAll(/<article[\s\S]*?<\/article>/g)]
      .map((m) => m[0].match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/)?.[1])
      .filter((t): t is string => Boolean(t))
      .map(plain);
    const tops = new Set(segs.map((s) => plain(s.trail[0] ?? "")));
    return { what: "feed posts with items", found: titles.filter((t) => tops.has(t)).length, total: titles.length };
  }
  const level = { "Atlassian Jira": 4, Okta: 4, Twilio: 3, "Microsoft Graph": 3 }[name];
  if (level) {
    const heads = [...html.matchAll(new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, "g"))]
      .map((m) => plain(m[1]!))
      .filter((h) => h && !/^(on this page|in this article|subscribe)/i.test(h)); // navigation, not content
    const trails = new Set(segs.flatMap((s) => s.trail.map(plain)));
    return { what: `h${level} headings kept`, found: heads.filter((h) => trails.has(h)).length, total: heads.length };
  }
  return null;
}

function forwardTickets(html: string): string[] {
  const tickets = new Set<string>();
  for (const sec of html.split(/<h2/).slice(1)) {
    if (/^[^>]*>\s*Appendix/.test(sec.replace(/<a[^>]*>|<\/a>/g, ""))) continue;
    for (const m of sec.matchAll(/<strong>\s*((?:FWD|FWDN|BUGX)-\d+)/g)) tickets.add(m[1]!);
  }
  return [...tickets];
}

async function main() {
  const pkg = await Bun.file(join(ROOT, "package.json")).json();
  const commit = sh(["git", "rev-parse", "--short", "HEAD"]).out.trim();
  const oasdiff = sh(["oasdiff", "--version"]);

  // 1. Unit tests
  console.error("unit tests…");
  const t = sh(["bun", "test"]);
  const num = (re: RegExp) => Number(t.out.match(re)?.[1] ?? 0);
  const unit = {
    pass: num(/^\s*(\d+) pass/m),
    fail: num(/^\s*(\d+) fail/m),
    files: num(/across (\d+) files?/),
    expects: num(/^\s*(\d+) expect\(\) calls/m),
  };

  // 2. Forward release notes → changeset (what `apidiff report` does)
  const forward = [];
  for (const v of FORWARD_RELEASES) {
    const url = forwardUrl(v);
    console.error(`forward ${v}…`);
    try {
      const html = await fetchHtml(url);
      const parsed = parseHtml(html);
      const cs = buildChangeset(parsed, { source: url });
      const items = [...parsed.buckets.values()].reduce((a, b) => a + b.length, 0);
      // Same check `apidiff report` runs: every ticket the page names is in some change.
      const text = cs.changes.map((c) => c.description).join("\n");
      const tickets = forwardTickets(html);
      const missed = tickets.filter((id) => !text.includes(id));
      forward.push({
        release: `${v}.0`, url, items, changes: cs.changes.length,
        tickets: tickets.length, ticketsFound: tickets.length - missed.length, missed,
        unclassifiedSections: parsed.inexactHeadings.filter((h) => h.via === "unclassified").map((h) => h.heading),
        fuzzyHeadings: parsed.inexactHeadings.filter((h) => h.via !== "unclassified").map((h) => `${h.heading} → ${h.bucket}`),
      });
    } catch (e) {
      forward.push({ release: `${v}.0`, url, error: (e as Error).message });
    }
  }

  // 3. Segmentation across vendors (what `apidiff segment` does)
  const segmentation = [];
  for (const { name, url } of VENDORS) {
    console.error(`segment ${name}…`);
    try {
      const html = await fetchHtml(url);
      const r = segmentReleaseNotes(html);
      const a = r.audit;
      segmentation.push({
        vendor: name, url, items: r.segments.length,
        ids: a.pageIds.length, idsFound: a.pageIds.length - a.missingIds.length,
        ops: a.pageOps.length, opsFound: a.pageOps.length - a.missingOps.length,
        independent: independentCheck(name, html, r),
      });
    } catch (e) {
      segmentation.push({ vendor: name, url, error: (e as Error).message });
    }
  }

  // 4. Breaking-change detection (what `apidiff schema --fail-on-breaking` does)
  const schema = [];
  if (oasdiff.code !== 0) {
    for (const p of SCHEMA_PAIRS) schema.push({ ...p, skipped: "oasdiff is not installed" });
  } else {
    const { schemaDiffService } = createCliApp();
    for (const p of SCHEMA_PAIRS) {
      console.error(`schema ${p.from} → ${p.to}…`);
      try {
        const r = await schemaDiffService.compare(forwardSpec(p.from), forwardSpec(p.to), "changelog");
        const failsBuild = schemaDiffService.hasBreakingChanges(r);
        schema.push({
          ...p, breaking: r.breakingCount, deprecated: r.deprecatedCount, nonBreaking: r.nonBreakingCount,
          failsBuild, correct: failsBuild === (p.expect === "breaking"),
        });
      } catch (e) {
        schema.push({ ...p, error: (e as Error).message });
      }
    }
  }

  const result = {
    measuredAt: new Date().toISOString(),
    version: pkg.version as string,
    commit,
    bun: Bun.version,
    oasdiff: oasdiff.code === 0 ? oasdiff.out.trim().split(/\s+/).pop() : null,
    unit,
    forward,
    segmentation,
    notFetchable: NOT_FETCHABLE,
    schema,
  };
  await Bun.write(OUT, JSON.stringify(result, null, 2) + "\n");
  console.error(`✓ wrote ${OUT.replace(ROOT + "/", "")}`);
}

await main();
