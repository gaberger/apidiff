// APIs.guru discovery adapter — finds versioned specs from the world's largest OpenAPI directory
// May only import from ports/ (never other adapters)

import type { ApiDiscoveryPort } from "../../core/ports/index.js";
import type { DiscoveredVersion, SpecSource } from "../../core/domain/discovery-types.js";

const APIS_GURU_LIST = "https://api.apis.guru/v2/list.json";

interface ApisGuruVersion {
  swaggerUrl?: string;
  swaggerYamlUrl?: string;
  info: {
    title: string;
    version: string;
    "x-apisguru-categories"?: string[];
  };
  updated: string;
}

interface ApisGuruEntry {
  versions: Record<string, ApisGuruVersion>;
  preferred: string;
}

// Cached directory — loaded once per process
let directoryCache: Record<string, ApisGuruEntry> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export class ApisGuruDiscoveryAdapter implements ApiDiscoveryPort {
  readonly sourceKind = "apis-guru" as const;

  async discover(source: SpecSource): Promise<DiscoveredVersion[]> {
    if (source.kind !== "apis-guru") {
      throw new Error(`ApisGuruDiscoveryAdapter cannot handle source kind: ${source.kind}`);
    }

    const directory = await this.loadDirectory();
    const { providerKey } = source;

    // APIs.guru keys are like "stripe.com" or "amazonaws.com:s3"
    // Find all entries matching the provider key prefix
    const matchingEntries = Object.entries(directory).filter(([key]) =>
      key === providerKey || key.startsWith(`${providerKey}:`),
    );

    if (matchingEntries.length === 0) return [];

    const versions: DiscoveredVersion[] = [];

    for (const [apiKey, entry] of matchingEntries) {
      for (const [versionId, versionData] of Object.entries(entry.versions)) {
        const specUrl = versionData.swaggerUrl || versionData.swaggerYamlUrl;
        if (!specUrl) continue;

        // For providers with sub-APIs (like AWS), include the sub-API name
        const subApi = apiKey.includes(":") ? apiKey.split(":")[1] : null;
        const label = subApi
          ? `${subApi}@${versionId}`
          : versionId;

        versions.push({
          label,
          version: versionId,
          url: specUrl,
          format: this.detectFormat(versionData),
        });
      }
    }

    return versions;
  }

  /** Search APIs.guru for providers matching a query */
  async search(query: string): Promise<Array<{ key: string; title: string; versions: string[] }>> {
    const directory = await this.loadDirectory();
    const q = query.toLowerCase();

    return Object.entries(directory)
      .filter(([key, entry]) => {
        const preferred = entry.versions[entry.preferred];
        const title = preferred?.info?.title?.toLowerCase() ?? "";
        return key.toLowerCase().includes(q) || title.includes(q);
      })
      .slice(0, 20)
      .map(([key, entry]) => ({
        key,
        title: entry.versions[entry.preferred]?.info?.title ?? key,
        versions: Object.keys(entry.versions),
      }));
  }

  private async loadDirectory(): Promise<Record<string, ApisGuruEntry>> {
    if (directoryCache && Date.now() < cacheExpiry) {
      return directoryCache;
    }

    const res = await fetch(APIS_GURU_LIST, {
      signal: AbortSignal.timeout(30_000),
      headers: { "User-Agent": "apidiff-discovery/2.0" },
    });

    if (!res.ok) {
      throw new Error(`APIs.guru returned ${res.status}`);
    }

    directoryCache = (await res.json()) as Record<string, ApisGuruEntry>;
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return directoryCache;
  }

  private detectFormat(v: ApisGuruVersion): DiscoveredVersion["format"] | undefined {
    if (v.swaggerUrl?.includes("swagger")) return "openapi-2.0";
    return undefined; // Could inspect the spec itself for 3.0/3.1
  }
}
