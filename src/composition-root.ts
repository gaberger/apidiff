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
import { ChangelogParserAdapter } from "./adapters/secondary/changelog-parser-adapter.js";
import { DiscoveryService } from "./core/usecases/discovery-service.js";
import type { ApiDiscoveryPort, IntegrationStoragePort, SpecProxyPort } from "./core/ports/index.js";
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
  discoveryService: DiscoveryService;
} {
  const integrationStore = new LocalStorageIntegrationAdapter();
  const specProxy = new BrowserProxyAdapter();

  // Browser-safe discovery adapters. No GitHub token — the client bundle
  // must not ship credentials; 60 req/hr unauthenticated is sufficient for
  // user-initiated discovery. Node-only adapters stay out of this wiring.
  const discoveryAdapters: ApiDiscoveryPort[] = [
    new GitHubDiscoveryAdapter(undefined),
    new ApisGuruDiscoveryAdapter(),
    new UrlDiscoveryAdapter(),
    new DocusaurusDiscoveryAdapter(),
  ];
  const changelogParser = new ChangelogParserAdapter();
  const discoveryService = new DiscoveryService(discoveryAdapters, changelogParser);

  return { integrationStore, specProxy, discoveryService };
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
