#!/usr/bin/env npx tsx
// Demo: API Discovery Agent — standalone composition root for discovery
//
// Usage:
//   npx tsx src/discovery-demo.ts                   # list all known providers
//   npx tsx src/discovery-demo.ts stripe             # discover Stripe specs
//   npx tsx src/discovery-demo.ts --category payments # discover all payment APIs
//   npx tsx src/discovery-demo.ts --search twilio     # search APIs.guru

import { GitHubDiscoveryAdapter } from "./adapters/secondary/github-discovery-adapter.js";
import { ApisGuruDiscoveryAdapter } from "./adapters/secondary/apisguru-discovery-adapter.js";
import { UrlDiscoveryAdapter } from "./adapters/secondary/url-discovery-adapter.js";
import { ChangelogParserAdapter } from "./adapters/secondary/changelog-parser-adapter.js";
import { DiscoveryService } from "./core/usecases/discovery-service.js";
import { allCategories } from "./core/domain/provider-registry.js";

// ── Wire up adapters (composition root pattern) ─────────────
const githubAdapter = new GitHubDiscoveryAdapter(process.env.GITHUB_TOKEN);
const apisGuruAdapter = new ApisGuruDiscoveryAdapter();
const urlAdapter = new UrlDiscoveryAdapter();
const changelogParser = new ChangelogParserAdapter();

const discovery = new DiscoveryService(
  [githubAdapter, apisGuruAdapter, urlAdapter],
  changelogParser,
);

// ── CLI ─────────────────────────────────────────────────────
const args = process.argv.slice(2);

async function main() {
  if (args.length === 0 || args[0] === "--list") {
    // List all known providers
    const providers = discovery.listProviders();
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║          APIDIFF — Known API Providers               ║");
    console.log("╚══════════════════════════════════════════════════════╝\n");

    for (const cat of allCategories()) {
      const inCat = providers.filter((p) => p.category === cat);
      console.log(`  ── ${cat.toUpperCase()} ${"─".repeat(40 - cat.length)}`);
      for (const p of inCat) {
        const src = p.specSource.kind === "github"
          ? `github:${p.specSource.owner}/${p.specSource.repo}`
          : p.specSource.kind === "apis-guru"
            ? `apis-guru:${p.specSource.providerKey}`
            : `url:${p.specSource.baseUrl}`;
        console.log(`    ${p.name.padEnd(20)} ${src}`);
      }
      console.log();
    }

    console.log(`  Total: ${providers.length} providers across ${allCategories().length} categories\n`);
    return;
  }

  if (args[0] === "--search" && args[1]) {
    // Search APIs.guru
    console.log(`\nSearching APIs.guru for "${args[1]}"...\n`);
    const results = await apisGuruAdapter.search(args[1]);
    if (results.length === 0) {
      console.log("  No results found.");
    } else {
      for (const r of results) {
        console.log(`  ${r.key.padEnd(35)} ${r.title}`);
        console.log(`    Versions: ${r.versions.join(", ")}\n`);
      }
    }
    return;
  }

  if (args[0] === "--category" && args[1]) {
    // Discover all providers in a category
    console.log(`\nDiscovering all ${args[1]} APIs...\n`);
    const results = await discovery.discoverByCategory(args[1]);
    for (const r of results) {
      printResult(r);
    }
    if (results.length === 0) {
      console.log(`  No providers found for category "${args[1]}"`);
      console.log(`  Available: ${allCategories().join(", ")}`);
    }
    return;
  }

  // Discover a specific provider
  const slug = args[0];
  console.log(`\nDiscovering ${slug}...\n`);
  const result = await discovery.discoverProvider(slug);
  if (!result) {
    console.log(`  Provider "${slug}" not found in registry.`);
    console.log(`  Try: --list to see known providers, or --search ${slug} to search APIs.guru`);
    return;
  }
  printResult(result);
}

function printResult(result: import("./core/domain/discovery-types.js").DiscoveryResult) {
  console.log(`┌─ ${result.provider} (source: ${result.source}) ────────────────`);
  console.log(`│  Discovered: ${result.discoveredAt}`);
  console.log(`│`);

  if (result.versions.length > 0) {
    console.log(`│  Versions (${result.versions.length}):`);
    for (const v of result.versions.slice(0, 20)) {
      console.log(`│    ${v.label.padEnd(25)} ${v.url.length > 60 ? v.url.slice(0, 60) + "…" : v.url}`);
    }
    if (result.versions.length > 20) {
      console.log(`│    ... and ${result.versions.length - 20} more`);
    }
  }

  if (result.pairs.length > 0) {
    console.log(`│`);
    console.log(`│  Diff Pairs (${result.pairs.length}):`);
    for (const p of result.pairs.slice(0, 10)) {
      console.log(`│    ${p.label}`);
    }
    if (result.pairs.length > 10) {
      console.log(`│    ... and ${result.pairs.length - 10} more`);
    }
  }

  if (result.changelogVersions.length > 0) {
    console.log(`│`);
    console.log(`│  Changelog Versions: ${result.changelogVersions.slice(0, 10).join(", ")}`);
  }

  console.log(`└${"─".repeat(50)}\n`);
}

main().catch((err) => {
  console.error("Discovery failed:", err.message);
  process.exit(1);
});
