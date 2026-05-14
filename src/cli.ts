#!/usr/bin/env bun
// CLI entry point

import { createCliApp } from "./composition-root.js";
import { stringify as yamlStringify } from "yaml";
import {
  parseHtml,
  buildChangeset,
  renderMarkdown,
} from "./core/domain/release-notes-changeset.js";

const { responseDiffService, schemaDiffService, presenter } = createCliApp();

const args = process.argv.slice(2);
const command = args[0];

// Provider spec URL registry
const PROVIDER_SPECS: Record<string, (v: string) => string> = {
  stripe: (v) => `https://raw.githubusercontent.com/stripe/openapi/${v}/openapi/spec3.json`,
  github: (v) => `https://raw.githubusercontent.com/github/rest-api-description/${v}/descriptions/api.github.com/api.github.com.json`,
  twilio: (v) => `https://raw.githubusercontent.com/twilio/twilio-oai/${v}/spec/json/twilio_api_v2010.json`,
  forward: (v) => {
    const parts = v.split(".").map(Number);
    const isNew = parts[0]! > 26 || (parts[0] === 26 && (parts[1] ?? 0) >= 2);
    return isNew
      ? `https://docs.fwd.app/${v}/api/spec/complete.json`
      : `https://docs.fwd.app/${v}/api-doc/api/spec/complete.json`;
  },
};

async function fetchSpec(urlOrPath: string): Promise<unknown> {
  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    const res = await fetch(urlOrPath, { headers: { "User-Agent": "apidiff" } });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText} from ${urlOrPath}`);
    return res.json();
  }
  return Bun.file(urlOrPath).json();
}

if (command === "diff") {
  const provider = getFlag(args, "--provider");

  if (provider) {
    // Provider mode: apidiff diff --provider forward 26.2 26.3
    const specFn = PROVIDER_SPECS[provider];
    if (!specFn) {
      presenter.presentError(`Unknown provider: ${provider}. Available: ${Object.keys(PROVIDER_SPECS).join(", ")}`);
      process.exit(1);
    }
    const providerArgs = args.filter((a) => a !== "--provider" && a !== provider && a !== "diff");
    const [oldVer, newVer] = providerArgs;
    if (!oldVer || !newVer) {
      presenter.presentError(`Usage: apidiff diff --provider ${provider} <old_version> <new_version>`);
      process.exit(1);
    }
    console.log(`  Fetching ${provider} spec ${oldVer}...`);
    const v1 = await fetchSpec(specFn(oldVer));
    console.log(`  Fetching ${provider} spec ${newVer}...`);
    const v2 = await fetchSpec(specFn(newVer));
    const results = responseDiffService.diff(v1, v2);
    presenter.presentDiffResults(results);
  } else {
    // File mode: apidiff diff <v1.json> <v2.json>
    const [, v1Path, v2Path] = args;
    if (!v1Path || !v2Path) {
      presenter.presentError("Usage: apidiff diff <v1.json> <v2.json>\n       apidiff diff --provider <name> <old_ver> <new_ver>");
      process.exit(1);
    }
    const v1 = await fetchSpec(v1Path);
    const v2 = await fetchSpec(v2Path);
    const results = responseDiffService.diff(v1, v2);
    presenter.presentDiffResults(results);
  }

} else if (command === "guide") {
  // Guide: apidiff guide <v1.json> <v2.json> [--base v1] [--revision v2] [--sunset 2025-01-01]
  const [, v1Path, v2Path] = args;
  if (!v1Path || !v2Path) {
    presenter.presentError("Usage: apidiff guide <v1.json> <v2.json> [--base v1] [--revision v2]");
    process.exit(1);
  }

  const baseVersion = getFlag(args, "--base") ?? "v1";
  const revisionVersion = getFlag(args, "--revision") ?? "v2";
  const sunsetDate = getFlag(args, "--sunset");

  const v1 = await Bun.file(v1Path).json();
  const v2 = await Bun.file(v2Path).json();
  const guide = responseDiffService.generateGuide(v1, v2, baseVersion, revisionVersion, sunsetDate);
  presenter.presentGuide(guide);

} else if (command === "report") {
  // Release-notes report: apidiff report <url> [--out path] [--api-name name]
  //                                            [--from ver] [--to ver]
  //                                            [--released YYYY-MM-DD]
  //                                            [--no-yaml] [--raw-html path]
  const reportArgs = args.slice(1);
  const VALUE_FLAGS = new Set(["--out", "--api-name", "--from", "--to", "--released", "--raw-html"]);
  const BOOL_FLAGS = new Set(["--no-yaml"]);
  const flags: Record<string, string | true> = {};
  const positionals: string[] = [];
  for (let i = 0; i < reportArgs.length; i++) {
    const a = reportArgs[i]!;
    if (VALUE_FLAGS.has(a)) flags[a] = reportArgs[++i] ?? "";
    else if (BOOL_FLAGS.has(a)) flags[a] = true;
    else if (a.startsWith("--")) {
      presenter.presentError(`unknown flag: ${a}`);
      process.exit(1);
    } else positionals.push(a);
  }

  const url = positionals[0];
  const rawHtmlPath = flags["--raw-html"] as string | undefined;
  if (!url && !rawHtmlPath) {
    presenter.presentError(
      "Usage: apidiff report <url> [--out path] [--api-name name] [--from ver] [--to ver] [--released YYYY-MM-DD] [--no-yaml] [--raw-html path]",
    );
    process.exit(1);
  }

  const html = rawHtmlPath
    ? await Bun.file(rawHtmlPath).text()
    : await (async () => {
        const res = await fetch(url!, { headers: { "User-Agent": "apidiff" } });
        if (!res.ok) throw new Error(`fetch ${url}: ${res.status} ${res.statusText}`);
        return res.text();
      })();

  const parsed = parseHtml(html);
  const itemCount = Array.from(parsed.buckets.values()).reduce((a, b) => a + b.length, 0);
  if (itemCount === 0) {
    console.error(
      "warn: no release-note items extracted. The page may be JS-rendered or use a layout this parser does not recognize. Pass --raw-html with pre-rendered HTML to retry.",
    );
  }

  const cs = buildChangeset(parsed, {
    source: url ?? rawHtmlPath,
    apiName: flags["--api-name"] as string | undefined,
    fromVersion: flags["--from"] as string | undefined,
    toVersion: flags["--to"] as string | undefined,
    released: flags["--released"] as string | undefined,
  });

  if (flags["--no-yaml"] !== true) {
    const outPath = (flags["--out"] as string | undefined) ?? `changeset-${cs.api.to.version}.yaml`;
    await Bun.write(outPath, yamlStringify(cs, { lineWidth: 0 }));
    console.error(`✓ wrote ${outPath}  (${cs.changes.length} changes)`);
  }

  process.stdout.write(renderMarkdown(parsed, cs, url ?? rawHtmlPath));

} else if (command === "schema") {
  // Schema diff: apidiff schema <base_url> <revision_url> [--mode changelog]
  const [, baseUrl, revisionUrl] = args;
  if (!baseUrl || !revisionUrl) {
    presenter.presentError("Usage: apidiff schema <base_url> <revision_url> [--mode changelog|breaking|summary]");
    process.exit(1);
  }

  const mode = (getFlag(args, "--mode") ?? "changelog") as "changelog" | "breaking" | "summary";
  const failOnBreaking = args.includes("--fail-on-breaking");

  const result = await schemaDiffService.compare(baseUrl, revisionUrl, mode);
  presenter.presentSchemaResult(result);

  if (failOnBreaking && schemaDiffService.hasBreakingChanges(result)) {
    process.exit(1);
  }

} else {
  console.log(`
  apidiff — API migration toolkit

  Commands:
    diff   <v1.json> <v2.json>                         Compare two JSON/spec files
    diff   --provider <name> <old_ver> <new_ver>       Fetch & compare provider specs
    guide  <v1.json> <v2.json> [--base v1] [--rev v2]  Generate migration guide
    schema <base_url> <revision_url> [--mode changelog] Compare OpenAPI schemas
    report <url> [--out path] [--no-yaml]              Release-notes → changeset YAML + MD report

  Providers:
    stripe   — Stripe OpenAPI specs (versions: v2228, v2229, ...)
    github   — GitHub REST API specs (versions: v2.0.0, v2.1.0, ...)
    twilio   — Twilio OAI specs (versions: 2.6.5, 2.6.6, ...)
    forward  — Forward Networks specs (versions: 25.9, 26.2, 26.3, ...)

  Options:
    --provider <name>                    Fetch specs from provider (stripe|github|twilio|forward)
    --mode changelog|breaking|summary    Schema diff mode (default: changelog)
    --fail-on-breaking                   Exit 1 if breaking changes found (CI)
    --base <version>                     Base version label
    --revision <version>                 Revision version label
    --sunset <date>                      Sunset date for migration guide

  Examples:
    apidiff diff old.json new.json
    apidiff diff --provider forward 26.2 26.3
    apidiff diff --provider stripe v2228 v2229
    apidiff guide old.json new.json --base v1 --revision v2 --sunset 2025-06-30
    apidiff report https://docs.fwd.app/release-notes/api/2026/release.26.2.0/
  `);
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}
