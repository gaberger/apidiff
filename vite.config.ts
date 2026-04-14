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
      // Inject api_key header into all /api proxy requests for dev auth
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
  };
});
