// Docusaurus discovery adapter — fetches /versions.json, then probes per-version
// OpenAPI spec files under <baseUrl>/<ver>/api/spec/. Tolerates archived versions
// that 404 and includes per-section specs for known slugs.
//
// May only import from ports/ (never other adapters).

import type { ApiDiscoveryPort } from "../../core/ports/index.js";
import type { DiscoveredVersion, SpecSource } from "../../core/domain/discovery-types.js";

/**
 * Sections known to publish per-section specs at <base>/<ver>/api/spec/<slug>.json.
 * Extending this list is safe — unknown slugs simply 404 and are skipped.
 */
const KNOWN_SECTIONS = [
  { slug: "complete", label: "Complete" },
  { slug: "aliases", label: "Aliases" },
  { slug: "checks", label: "Checks" },
  { slug: "credentials", label: "Credentials" },
  { slug: "networks", label: "Networks" },
  { slug: "nqe", label: "NQE" },
  { slug: "path-search", label: "Path Search" },
] as const;

const TIMEOUT_MS = 10_000;

export class DocusaurusDiscoveryAdapter implements ApiDiscoveryPort {
  readonly sourceKind = "docusaurus" as const;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async discover(source: SpecSource): Promise<DiscoveredVersion[]> {
    if (source.kind !== "docusaurus") {
      throw new Error(`DocusaurusDiscoveryAdapter cannot handle source kind: ${source.kind}`);
    }

    const base = source.baseUrl.replace(/\/+$/, "");

    // Step 1: fetch the versions manifest
    const versions = await this.fetchVersions(base);
    if (versions.length === 0) return [];

    // Step 2: for each version × known section, probe in parallel
    const probes: Promise<DiscoveredVersion | null>[] = [];
    for (const ver of versions) {
      for (const section of KNOWN_SECTIONS) {
        probes.push(this.probe(base, ver, section.slug, section.label));
      }
    }
    const settled = await Promise.allSettled(probes);
    const results: DiscoveredVersion[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
    return results;
  }

  private async fetchVersions(base: string): Promise<string[]> {
    try {
      const res = await this.fetchImpl(`${base}/versions.json`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "apidiff-discovery/2.0" },
      });
      if (!res.ok) return [];
      const data: { versions?: string[]; baseVersions?: string[] } = await res.json();
      // Merge both arrays; dedupe preserving first-seen order (primary versions first).
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const v of [...(data.versions ?? []), ...(data.baseVersions ?? [])]) {
        if (typeof v === "string" && !seen.has(v)) { seen.add(v); merged.push(v); }
      }
      return merged;
    } catch {
      return [];
    }
  }

  private async probe(
    base: string,
    version: string,
    slug: string,
    sectionLabel: string,
  ): Promise<DiscoveredVersion | null> {
    const url = `${base}/${version}/api/spec/${slug}.json`;
    try {
      const res = await this.fetchImpl(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "apidiff-discovery/2.0" },
      });
      if (!res.ok) return null;
      return {
        label: `v${version} · ${sectionLabel}`,
        version,
        url,
        // Docusaurus-served Forward Networks specs are OpenAPI 3.1 in practice;
        // downstream can re-detect on full fetch if needed.
        format: "openapi-3.1",
      };
    } catch {
      return null;
    }
  }
}
