import base44 from "@base44/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    logLevel: "error",
    plugins: [
      base44({
        legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === "true",
        hmrNotifier: true,
        navigationNotifier: true,
        analyticsTracker: true,
        visualEditAgent: true,
      }),
      react(),
      // Inject api_key header into all /api proxy requests for dev auth.
      // Runs server-side in the Vite dev middleware only — the key is read
      // via loadEnv (NOT import.meta.env), so it never ends up in the
      // client bundle. In production this middleware is inactive and auth
      // is expected to flow through the session-exchange endpoint tracked
      // by wp-security-client-api-key-remediation.
      ...(env.BASE44_API_KEY
        ? [
            {
              name: "base44-api-key-injector",
              configureServer(server: import("vite").ViteDevServer) {
                server.middlewares.use("/api", (req, _res, next) => {
                  req.headers["api_key"] = env.BASE44_API_KEY;
                  next();
                });
              },
            },
          ]
        : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@domain": path.resolve(__dirname, "src/core/domain"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:4747",
          changeOrigin: true,
        },
      },
    },
    worker: {
      format: "es",
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    optimizeDeps: {
      // Force pre-bundling so the Web Worker (diff-worker.js) gets a
      // single ESM bundle of $RefParser instead of a maze of .cjs files
      // the dev server refuses to transform. Must stay in sync with
      // the worker import.
      include: ["@apidevtools/json-schema-ref-parser"],
    },
  };
});
