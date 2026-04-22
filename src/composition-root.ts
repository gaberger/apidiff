// Composition root — the ONLY file that imports across boundaries
// Wires adapters to ports and creates use case instances

import { ResponseDiffService } from "./core/usecases/response-diff-service.js";
import { SchemaDiffService } from "./core/usecases/schema-diff-service.js";
import { MemoryChecklistStorage } from "./adapters/secondary/memory-storage.js";
import { SchemaFetchAdapter } from "./adapters/secondary/schema-fetch-adapter.js";
import { OasdiffAdapter } from "./adapters/secondary/oasdiff-adapter.js";
import { CliAdapter } from "./adapters/primary/cli-adapter.js";
import { WebAdapter } from "./adapters/primary/web-adapter.js";
import { SpecInputAdapter } from "./adapters/secondary/spec-input-adapter.js";
import { GitHubDiscoveryAdapter } from "./adapters/secondary/github-discovery-adapter.js";
import { ApisGuruDiscoveryAdapter } from "./adapters/secondary/apisguru-discovery-adapter.js";
import { UrlDiscoveryAdapter } from "./adapters/secondary/url-discovery-adapter.js";
import { DocusaurusDiscoveryAdapter } from "./adapters/secondary/docusaurus-discovery-adapter.js";
import { LocalStorageIntegrationAdapter } from "./adapters/secondary/localstorage-integration-adapter.js";
import { BrowserProxyAdapter } from "./adapters/secondary/browser-proxy-adapter.js";
import { LocalStorageSchemaCacheAdapter } from "./adapters/secondary/localstorage-schema-cache-adapter.js";
import { LocalStorageSchemaUrlAdapter } from "./adapters/secondary/localstorage-schema-url-adapter.js";
import { SupabaseIntegrationAdapter } from "./adapters/secondary/supabase/integration-adapter.js";
import { SupabaseSchemaCacheAdapter } from "./adapters/secondary/supabase/schema-cache-adapter.js";
import { SupabaseSchemaUrlAdapter } from "./adapters/secondary/supabase/schema-url-adapter.js";
import { hasSupabase } from "./adapters/secondary/supabase/client.js";
import { BrowserChangelogParserAdapter } from "./adapters/secondary/browser-changelog-parser-adapter.js";
import { DiscoveryService } from "./core/usecases/discovery-service.js";
import { ReleaseNotesService } from "./core/usecases/release-notes-service.js";
import { ForwardNetworksReleaseNotesAdapter } from "./adapters/secondary/forward-networks-release-notes-adapter.js";
import fwdData from "./data/fwdnetworks.json";
import type {
  ApiDiscoveryPort,
  IntegrationStoragePort,
  SpecProxyPort,
  SchemaCachePort,
  SchemaUrlRegistryPort,
  ReleaseNotesPort,
} from "./core/ports/index.js";
import type { SpecSource } from "./core/domain/discovery-types.js";

export function createCliApp() {
  const storage = new MemoryChecklistStorage();
  const schemaFetch = new SchemaFetchAdapter();
  const oasdiff = new OasdiffAdapter();

  const responseDiffService = new ResponseDiffService(storage);
  const schemaDiffService = new SchemaDiffService(schemaFetch, oasdiff);
  const presenter = new CliAdapter();

  return { responseDiffService, schemaDiffService, presenter };
}

export function createWebApp() {
  const storage = new MemoryChecklistStorage();
  const responseDiffService = new ResponseDiffService(storage);
  const specInput = new SpecInputAdapter();

  const webAdapter = new WebAdapter(
    (oldJson, newJson) => responseDiffService.diff(oldJson, newJson),
    (oldJson, newJson, baseVersion, revisionVersion, sunsetDate) =>
      responseDiffService.generateGuide(oldJson, newJson, baseVersion, revisionVersion, sunsetDate),
    specInput,
  );

  return { responseDiffService, webAdapter, specInput };
}

/**
 * Browser-only wiring. Called once at module-init from the React bridge
 * (src/lib/useIntegrationStore.js). Safe to import into JSX/TSX bundles:
 * contains no Node-specific imports.
 */
export function createBrowserStores(): {
  integrationStore: IntegrationStoragePort;
  specProxy: SpecProxyPort;
  schemaCache: SchemaCachePort;
  schemaUrlRegistry: SchemaUrlRegistryPort;
  discoveryService: DiscoveryService;
  releaseNotesService: ReleaseNotesService;
} {
  // Persistence layer — pick Supabase if env is configured (VITE_SUPABASE_URL
  // + VITE_SUPABASE_ANON_KEY present at build time), otherwise fall back to
  // the localStorage adapters. Same port contracts, different backends —
  // downstream code is unaware of the swap.
  const useSupabase = hasSupabase();
  const integrationStore = useSupabase
    ? new SupabaseIntegrationAdapter()
    : new LocalStorageIntegrationAdapter();

  // alwaysProxy: true — route every fetch through the Vercel Function so we
  // never hit browser CORS rejections for non-CORS-friendly hosts (docs.fwd.app,
  // most vendor docs sites). The server has no origin restriction.
  const specProxy = new BrowserProxyAdapter({ alwaysProxy: true });

  // Data layer — cache for fetched schemas, registry for tracked URLs.
  // localStorage variant writes to the apidiff:spec:* keyspace; Supabase
  // variant writes to public.schema_cache. fetch-spec.js consumes this via
  // the SchemaCachePort — no direct storage access anywhere in src/lib.
  const schemaCache = useSupabase
    ? new SupabaseSchemaCacheAdapter()
    : new LocalStorageSchemaCacheAdapter();
  const schemaUrlRegistry = useSupabase
    ? new SupabaseSchemaUrlAdapter()
    : new LocalStorageSchemaUrlAdapter();

  // Browser-safe discovery adapters. No GitHub token — the client bundle
  // must not ship credentials; 60 req/hr unauthenticated is sufficient for
  // user-initiated discovery. Node-only adapters stay out of this wiring.
  const discoveryAdapters: ApiDiscoveryPort[] = [
    new GitHubDiscoveryAdapter(undefined),
    new ApisGuruDiscoveryAdapter(),
    new UrlDiscoveryAdapter(),
    new DocusaurusDiscoveryAdapter(),
  ];
  // Browser changelog parser routes through /api/proxy-fetch so upstream
  // CORS rejections (docs.fwd.app, github.blog, stripe.com/docs, etc.) don't
  // turn every changelog fetch into a TypeError in the console.
  const changelogParser = new BrowserChangelogParserAdapter();
  // Registry is optional on DiscoveryService; passing it makes every
  // discovered version URL land in schema_urls (Supabase or localStorage).
  const discoveryService = new DiscoveryService(
    discoveryAdapters,
    changelogParser,
    schemaUrlRegistry,
  );

  // Release-notes adapters — one per integration. Each wraps a provider-
  // specific data source (static JSON today for Forward Networks; future
  // adapters can scrape at runtime or bundle per-provider data). Adding a
  // new provider means dropping a new adapter here; no UI code change.
  const releaseNotesAdapters: ReleaseNotesPort[] = [
    new ForwardNetworksReleaseNotesAdapter(fwdData.versions),
  ];
  const releaseNotesService = new ReleaseNotesService(releaseNotesAdapters);

  return { integrationStore, specProxy, schemaCache, schemaUrlRegistry, discoveryService, releaseNotesService };
}

/** Registry of discovery adapters keyed by the SpecSource kind they handle. */
export function createDiscoveryAdapters(): Map<SpecSource["kind"], ApiDiscoveryPort> {
  const adapters = new Map<SpecSource["kind"], ApiDiscoveryPort>();
  adapters.set("github", new GitHubDiscoveryAdapter(process.env.GITHUB_TOKEN));
  adapters.set("apis-guru", new ApisGuruDiscoveryAdapter());
  adapters.set("url", new UrlDiscoveryAdapter());
  adapters.set("docusaurus", new DocusaurusDiscoveryAdapter());
  return adapters;
}
