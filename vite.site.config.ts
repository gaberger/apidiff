// Vite config for the static spec site. Builds spec.html (the Changeset Spec
// page alone) into site-dist/. Unlike vite.config.ts it has no dev proxy, so
// it does not import api/ and the deploy needs no server functions.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  logLevel: "warn",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@domain": path.resolve(import.meta.dirname, "src/core/domain"),
    },
  },
  build: {
    outDir: "site-dist",
    emptyOutDir: true,
    rolldownOptions: {
      input: path.resolve(import.meta.dirname, "spec.html"),
    },
  },
});
