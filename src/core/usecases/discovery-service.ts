// Discovery use case — orchestrates spec discovery across multiple sources
// May import from domain/ and ports/ only

import type { ApiProvider, DiscoveryResult, DiscoveredVersion, VersionPair, SpecSource } from "../domain/discovery-types.js";
import type { ApiDiscoveryPort, ChangelogParserPort, SchemaUrlRegistryPort } from "../ports/index.js";
import { PROVIDER_REGISTRY, findProvider } from "../domain/provider-registry.js";

export class DiscoveryService {
  private readonly adapters: Map<string, ApiDiscoveryPort>;
  private readonly changelogParser: ChangelogParserPort;
  private readonly urlRegistry: SchemaUrlRegistryPort | undefined;

  constructor(
    discoveryAdapters: ApiDiscoveryPort[],
    changelogParser: ChangelogParserPort,
    urlRegistry?: SchemaUrlRegistryPort,
  ) {
    this.adapters = new Map(discoveryAdapters.map((a) => [a.sourceKind, a]));
    this.changelogParser = changelogParser;
    this.urlRegistry = urlRegistry;
  }

  /**
   * Persist every discovered version URL to the registry. Idempotent:
   * SchemaUrlRegistryPort.add() dedupes by url. Failures are swallowed so a
   * persistence outage never breaks the discovery flow.
   */
  private async registerVersions(
    versions: readonly DiscoveredVersion[],
    providerLabel: string,
  ): Promise<void> {
    if (!this.urlRegistry) return;
    await Promise.allSettled(
      versions.map((v) =>
        this.urlRegistry!.add({ url: v.url, label: `${providerLabel} ${v.label}` }),
      ),
    );
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

  /**
   * Discover from a free-form input: provider name/slug OR raw URL.
   * Inference order: registry slug → github URL → apis-guru URL → direct url.
   * Optional changelogUrl is parsed best-effort.
   */
  async discoverByUrl(
    input: string,
    changelogUrl?: string,
  ): Promise<DiscoveryResult | null> {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // 1. Registry match by slug (case-insensitive).
    const slugCandidate = trimmed.toLowerCase();
    const fromRegistry = findProvider(slugCandidate);
    if (fromRegistry) {
      return this.discoverFromProvider(
        changelogUrl ? { ...fromRegistry, changelogUrl } : fromRegistry,
      );
    }

    // 2. URL-shape inference.
    const specSource = inferSpecSource(trimmed);
    if (!specSource) return null;

    const adapter = this.adapters.get(specSource.kind);
    if (!adapter) {
      throw new Error(`No adapter registered for source kind: ${specSource.kind}`);
    }

    const versions = await adapter.discover(specSource);
    const sorted = sortVersions(versions);
    const pairs = buildPairs(sorted);

    let changelogVersions: string[] = [];
    if (changelogUrl) {
      try {
        changelogVersions = await this.changelogParser.parse(changelogUrl);
      } catch {
        // Best-effort.
      }
    }

    const providerName = deriveProviderName(trimmed);
    await this.registerVersions(sorted, providerName);

    return {
      provider: providerName,
      versions: sorted,
      pairs,
      changelogVersions,
      source: specSource.kind,
      discoveredAt: new Date().toISOString(),
    };
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

    await this.registerVersions(sorted, provider.name);

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

/** Infer a SpecSource from a free-form URL (best-effort URL-shape matching). */
function inferSpecSource(input: string): SpecSource | null {
  // GitHub repo URLs → github source.
  const gh = input.match(/^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)(?:\/tree\/[^/]+\/(.+?))?\/?$/i);
  if (gh) {
    const [, owner, repo, path] = gh;
    return { kind: "github", owner: owner!, repo: repo!.replace(/\.git$/, ""), path };
  }

  // apis.guru provider URLs → apis-guru source.
  const guru = input.match(/^https?:\/\/api\.apis\.guru\/v2\/specs\/([^/]+)/i);
  if (guru) {
    return { kind: "apis-guru", providerKey: guru[1]! };
  }

  // Anything that looks like a URL → direct spec URL.
  try {
    const u = new URL(input);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return {
        kind: "url",
        specUrls: [{ label: "spec", url: u.toString() }],
      };
    }
  } catch {
    // Not a URL.
  }

  return null;
}

/** Derive a display name from a raw URL or slug. */
function deriveProviderName(input: string): string {
  try {
    const u = new URL(input);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return input;
  }
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
