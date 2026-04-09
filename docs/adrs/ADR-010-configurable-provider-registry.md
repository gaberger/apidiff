# ADR-010: Configurable and Discoverable Provider Registry

## Status
Proposed

## Date
2026-04-09

## Context

ADR-009 introduced a hardcoded `PROVIDERS` registry inside the web adapter (`web-adapter.ts:275-310`). This works for the initial provider set (Stripe, GitHub, Twilio, Forward Networks) but has several problems:

1. **Adding a provider requires editing the adapter** — violates open/closed principle
2. **The `Provider` interface is a local type** — not accessible to other adapters or use cases
3. **No runtime discovery** — the UI can't list available providers without a dedicated endpoint
4. **No user customization** — teams can't add their own private API providers
5. **Version fetching, spec URLs, and tag filters are all inlined** — no separation of concerns
6. **Caching logic lives in the web adapter** — should be a secondary adapter concern

The provider registry should be a domain concept with a port interface, enabling:
- Configuration via a JSON/YAML file (user-defined providers)
- Runtime discovery via API (`GET /api/providers`)
- New providers without code changes
- Separation of caching from routing

## Decision

### 1. Domain type: `ProviderConfig`

Move the provider definition to the domain layer as a pure data type:

```typescript
// domain/types.ts
export interface ProviderConfig {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;          // SVG path data
  readonly color?: string;         // Brand accent hex
  readonly specSource: SpecSource;
}

export type SpecSource =
  | { readonly type: "github-tags"; readonly repo: string; readonly specPath: string; readonly tagFilter?: string }
  | { readonly type: "versions-url"; readonly url: string; readonly specUrlTemplate: string }
  | { readonly type: "static-urls"; readonly versions: Record<string, string> };
```

`SpecSource` is a discriminated union covering the three discovery patterns already implemented:
- **github-tags**: Fetch tags from a GitHub repo, filter, build raw.githubusercontent URLs (Stripe, GitHub, Twilio)
- **versions-url**: Fetch a custom versions endpoint, build spec URLs from a template (Forward Networks)
- **static-urls**: Explicit version→URL mapping for providers without programmatic discovery

### 2. Port: `ProviderRegistryPort`

```typescript
// ports/index.ts
export interface ProviderRegistryPort {
  listProviders(): Promise<ProviderConfig[]>;
  getProvider(id: string): Promise<ProviderConfig | null>;
  getVersions(id: string): Promise<string[]>;
  getSpecUrl(id: string, version: string): string;
}
```

### 3. Secondary adapter: `ProviderRegistryAdapter`

A new secondary adapter that:
- Loads built-in providers from a static default set (the current 4)
- Merges user-defined providers from `~/.apidiff/providers.json` or `./providers.json` (nearest file wins)
- Implements version fetching with caching (moved from web adapter)
- Resolves spec URLs from the `SpecSource` discriminated union

```typescript
// adapters/secondary/provider-registry-adapter.ts
export class ProviderRegistryAdapter implements ProviderRegistryPort {
  private readonly providers: Map<string, ProviderConfig>;
  private readonly versionCache: Map<string, { versions: string[]; ts: number }>;

  constructor(userConfigPath?: string) {
    this.providers = new Map();
    this.versionCache = new Map();
    this.loadDefaults();
    if (userConfigPath) this.loadUserConfig(userConfigPath);
  }
  // ...
}
```

### 4. Configuration file format

Users can define custom providers in `providers.json`:

```json
{
  "providers": [
    {
      "id": "internal-api",
      "name": "Internal Platform API",
      "specSource": {
        "type": "static-urls",
        "versions": {
          "v2.1": "https://internal.example.com/api/v2.1/openapi.json",
          "v3.0": "https://internal.example.com/api/v3.0/openapi.json"
        }
      }
    },
    {
      "id": "petstore",
      "name": "Petstore Demo",
      "specSource": {
        "type": "github-tags",
        "repo": "OAI/OpenAPI-Specification",
        "specPath": "examples/v3.0/petstore.json",
        "tagFilter": "^v3\\."
      }
    }
  ]
}
```

### 5. Discovery endpoint

The web adapter exposes a listing endpoint:

```
GET /api/providers → [{ id, name, icon, color }]
GET /api/providers/:id/versions → { provider, versions: string[] }
GET /api/providers/:id/spec?version=X → OpenAPI spec JSON
```

These already exist in the web adapter — the change is that they delegate to `ProviderRegistryPort` instead of reading the hardcoded `PROVIDERS` object directly.

### 6. Web adapter cleanup

Remove from the web adapter:
- The `Provider` interface (replaced by `ProviderConfig` in domain)
- The `PROVIDERS` const (replaced by the registry adapter)
- The `specMemCache`, `versionCache`, `getCachedSpec`, `setCachedSpec` methods (moved to registry adapter)
- The `VERSION_TTL`, `CACHE_DIR` constants (moved to registry adapter)

The web adapter's `handleProviderVersions` and `handleProviderSpec` become thin pass-throughs:

```typescript
private async handleProviderVersions(id: string): Promise<Response> {
  const versions = await this.providerRegistry.getVersions(id);
  return Response.json({ provider: id, versions });
}
```

### 7. Composition root wiring

```typescript
const providerRegistry = new ProviderRegistryAdapter("./providers.json");
const webAdapter = new WebAdapter(diffHandler, guideHandler, specInput, providerRegistry);
```

## Consequences

- **Open for extension**: Adding a provider = adding a JSON entry, no code changes
- **User-customizable**: Teams can register private APIs in `providers.json`
- **Discoverable**: `GET /api/providers` returns available providers at runtime
- **Separation of concerns**: Caching moves to the secondary adapter where it belongs
- **Domain purity maintained**: `ProviderConfig` and `SpecSource` are pure types with zero deps
- **Backward compatible**: Built-in providers remain the same; the JSON config is optional
- **Testing**: Registry adapter can be unit-tested with static `SpecSource` entries (no HTTP needed)

## Alternatives Considered

### Keep providers in the web adapter, add a config loader
Rejected: Mixing I/O (config loading, HTTP caching) with routing violates hexagonal boundaries. The web adapter should only translate HTTP ↔ port calls.

### Use a database for provider storage
Rejected: Over-engineering for this use case. A JSON file is human-editable, version-controllable, and sufficient for dozens of providers.

### Environment variables per provider
Rejected: Doesn't scale. Each provider has 3-5 fields; env vars would be unwieldy beyond 2-3 providers.
