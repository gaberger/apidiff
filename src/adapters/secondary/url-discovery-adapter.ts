// URL discovery adapter — validates and fetches specs from direct URLs
// May only import from ports/ (never other adapters)

import type { ApiDiscoveryPort } from "../../core/ports/index.js";
import type { DiscoveredVersion, SpecSource } from "../../core/domain/discovery-types.js";

export class UrlDiscoveryAdapter implements ApiDiscoveryPort {
  readonly sourceKind = "url" as const;

  async discover(source: SpecSource): Promise<DiscoveredVersion[]> {
    if (source.kind !== "url") {
      throw new Error(`UrlDiscoveryAdapter cannot handle source kind: ${source.kind}`);
    }

    const results: DiscoveredVersion[] = [];

    // Validate each URL by fetching headers and detecting OpenAPI format
    const checks = source.specUrls.map(async (spec) => {
      const format = await this.detectFormat(spec.url);
      if (format) {
        results.push({
          label: spec.label,
          version: spec.label,
          url: spec.url,
          format,
        });
      }
    });

    await Promise.allSettled(checks);
    return results;
  }

  /** Fetch the first few bytes to detect OpenAPI format */
  private async detectFormat(url: string): Promise<DiscoveredVersion["format"] | undefined> {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { "User-Agent": "apidiff-discovery/2.0" },
      });
      if (!res.ok) return undefined;

      const text = await res.text();
      // Quick checks on the content
      if (text.includes('"openapi"') || text.includes("openapi:")) {
        if (text.includes('"3.1') || text.includes("'3.1") || text.includes("3.1.")) return "openapi-3.1";
        if (text.includes('"3.0') || text.includes("'3.0") || text.includes("3.0.")) return "openapi-3.0";
      }
      if (text.includes('"swagger"') || text.includes("swagger:")) return "openapi-2.0";
      // If it parsed as JSON/YAML but we couldn't determine the version, still accept it
      if (text.startsWith("{") || text.startsWith("openapi") || text.startsWith("swagger")) return "openapi-3.0";
      return undefined;
    } catch {
      return undefined;
    }
  }
}
