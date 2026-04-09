// Domain types for API discovery — zero external imports

/** A known API provider with metadata for discovering its specs */
export interface ApiProvider {
  readonly name: string;
  readonly slug: string;
  readonly category: ApiCategory;
  readonly specSource: SpecSource;
  readonly changelogUrl?: string;
  readonly docsUrl?: string;
}

export type ApiCategory =
  | "payments"
  | "communications"
  | "developer-tools"
  | "cloud"
  | "social"
  | "analytics"
  | "identity"
  | "commerce"
  | "ai"
  | "infrastructure"
  | "other";

/** Where to find OpenAPI specs for a provider */
export type SpecSource =
  | { readonly kind: "github"; readonly owner: string; readonly repo: string; readonly path?: string }
  | { readonly kind: "apis-guru"; readonly providerKey: string }
  | { readonly kind: "url"; readonly specUrls: readonly DirectSpecUrl[] };

/** A direct URL to an OpenAPI spec, with version label */
export interface DirectSpecUrl {
  readonly label: string;
  readonly url: string;
}

/** A single discovered API spec version */
export interface DiscoveredVersion {
  readonly label: string;
  readonly version: string;
  readonly url: string;
  readonly format?: "openapi-2.0" | "openapi-3.0" | "openapi-3.1";
}

/** A pair of versions suitable for diffing */
export interface VersionPair {
  readonly label: string;
  readonly v1: DiscoveredVersion;
  readonly v2: DiscoveredVersion;
}

/** Complete discovery result for one provider */
export interface DiscoveryResult {
  readonly provider: string;
  readonly versions: DiscoveredVersion[];
  readonly pairs: VersionPair[];
  readonly changelogVersions: string[];
  readonly source: "github" | "apis-guru" | "url";
  readonly discoveredAt: string; // ISO 8601
}
