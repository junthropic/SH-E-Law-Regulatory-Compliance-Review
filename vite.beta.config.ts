import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// v8 beta screens: a separate entry so the frozen app (index.html, src/, vite.config.ts, dist/) is untouched.
// Build: node scripts/build-beta-v8.mjs  (writes dist-beta/ and its source digest)
export default defineConfig({
  root: resolve(import.meta.dirname, "beta"),
  base: "/beta/",
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, "dist-beta"), emptyOutDir: true },
});
