import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";
import { safeFetch } from "./api/_lib/ssrf-guard.js";

export default defineConfig(() => {
  return {
    logLevel: "error",
    // Expose both VITE_* (local dev convention) and NEXT_PUBLIC_* (Vercel's
    // default browser-safe namespace) to the client bundle. Lets Supabase
    // credentials provisioned by the Vercel Supabase integration flow in
    // without requiring a second VITE_-prefixed copy of every secret.
    // Only prefix browser-safe values; service-role keys stay unprefixed.
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    plugins: [
      react(),
      // Dev-mode mirror of the /api/proxy-fetch Vercel Function.
      // In production Vercel serves the handler from api/proxy-fetch.ts;
      // in `vite dev` we inline the same logic here so CORS-restricted spec
      // URLs resolve against the local dev server.
      {
        name: "apidiff-proxy-fetch-dev",
        configureServer(server: import("vite").ViteDevServer) {
          server.middlewares.use("/api/proxy-fetch", async (req, res) => {
            const sendJson = (status: number, body: unknown) => {
              res.statusCode = status;
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify(body));
            };
            try {
              const host = req.headers.host ?? "localhost";
              const fullUrl = new URL(req.url ?? "", `http://${host}`);
              const target = fullUrl.searchParams.get("url");
              if (!target) {
                sendJson(400, { error: "missing url query parameter" });
                return;
              }
              const result = await safeFetch(target);
              if (!result.ok) {
                sendJson(result.status, { error: result.error });
                return;
              }
              const contentType = result.response.headers.get("content-type") ?? undefined;
              const raw = await result.response.text();
              const looksJson = (contentType ?? "").toLowerCase().includes("json")
                || raw.trimStart().startsWith("{")
                || raw.trimStart().startsWith("[");
              let document: unknown = raw;
              if (looksJson) {
                try { document = JSON.parse(raw); } catch { /* keep as string */ }
              }
              sendJson(200, { document, contentType, status: result.response.status });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : "unknown fetch error";
              sendJson(502, { error: `upstream fetch failed: ${msg}` });
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@domain": path.resolve(__dirname, "src/core/domain"),
      },
    },
    server: {
      port: 5173,
    },
    worker: {
      format: "es",
      rolldownOptions: {
        output: {
          codeSplitting: false,
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
