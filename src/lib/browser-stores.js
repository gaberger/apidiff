// Single-instance bridge to the composition-root's browser ports.
// Per ADR-020: JSX consumes ports through this module; JSX must not import
// adapters or @/api/* directly. Instantiation happens ONCE at module init.

import { createBrowserStores } from "@/composition-root";

const stores = createBrowserStores();

export const integrationStore = stores.integrationStore;
export const specProxy = stores.specProxy;
export const schemaCache = stores.schemaCache;
export const schemaUrlRegistry = stores.schemaUrlRegistry;
export const discoveryService = stores.discoveryService;
