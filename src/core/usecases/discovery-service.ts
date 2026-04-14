// Discovery use case — orchestrates spec discovery across multiple sources
// May import from domain/ and ports/ only

import type { ApiProvider, DiscoveryResult, DiscoveredVersion, VersionPair } from "../domain/discovery-types.js";
import type { ApiDiscoveryPort, ChangelogParserPort } from "../ports/index.js";
import { PROVIDER_REGISTRY, findProvider } from "../domain/provider-registry.js";

export class DiscoveryService {
  private readonly adapters: Map<string, ApiDiscoveryPort>;
  private readonly changelogParser: ChangelogParserPort;

  constructor(
    discoveryAdapters: ApiDiscoveryPort[],
    changelogParser: ChangelogParserPort,
  ) {
    this.adapters = new Map(discoveryAdapters.map((a) => [a.sourceKind, a]));
    this.changelogParser = changelogParser;
  }

  /** Discover all versions for a known provider by slug */
  async discoverProvider(slug: string): Promise<DiscoveryResult | null> {
    const provider = findProvider(slug);
    if (!provider) return null;
    return this.discoverFromProvider(provider);
  }

  /** Discover versions for all registered providers */
  async discoverAll(): Promise<DiscoveryResult[]> {
    const results = await Promise.allSettled(
      PROVIDER_REGISTRY.map((p) => this.discoverFromProvider(p)),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<DiscoveryResult> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  /** Discover versions for providers in a specific category */
  async discoverByCategory(category: string): Promise<DiscoveryResult[]> {
    const providers = PROVIDER_REGISTRY.filter((p) => p.category === category);
    const results = await Promise.allSettled(
      providers.map((p) => this.discoverFromProvider(p)),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<DiscoveryResult> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  /** List all known providers (no network calls) */
  listProviders(): readonly ApiProvider[] {
    return PROVIDER_REGISTRY;
  }

  private async discoverFromProvider(provider: ApiProvider): Promise<DiscoveryResult> {
    const adapter = this.adapters.get(provider.specSource.kind);
    if (!adapter) {
      throw new Error(`No adapter registered for source kind: ${provider.specSource.kind}`);
    }

    const versions = await adapter.discover(provider.specSource);
    const sorted = sortVersions(versions);
    const pairs = buildPairs(sorted);

    let changelogVersions: string[] = [];
    if (provider.changelogUrl) {
      try {
        changelogVersions = await this.changelogParser.parse(provider.changelogUrl);
      } catch {
        // Changelog parsing is best-effort
      }
    }

    return {
      provider: provider.name,
      versions: sorted,
      pairs,
      changelogVersions,
      source: provider.specSource.kind,
      discoveredAt: new Date().toISOString(),
    };
  }
}

/** Sort versions using natural ordering (v1 < v2 < v10) */
function sortVersions(versions: DiscoveredVersion[]): DiscoveredVersion[] {
  return [...versions].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

/** Build adjacent version pairs for diffing */
function buildPairs(sorted: DiscoveredVersion[]): VersionPair[] {
  const pairs: VersionPair[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    // Loop bound guarantees both indices are in range; assert non-null to
    // satisfy noUncheckedIndexedAccess.
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    pairs.push({
      label: `${a.label} → ${b.label}`,
      v1: a,
      v2: b,
    });
  }
  return pairs;
}
