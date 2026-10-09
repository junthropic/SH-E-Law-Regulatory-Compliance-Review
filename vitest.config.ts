import { defineConfig } from "vitest/config";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

// Date-matrix runs: compute the clock offset once here and hand it to every test process and Node child.
if (process.env.SHE_TEST_NOW && !process.env.SHE_TEST_CLOCK_OFFSET_MS) {
  const at = Date.parse(process.env.SHE_TEST_NOW);
  if (!Number.isFinite(at)) throw new Error("SHE_TEST_NOW is not a date: " + process.env.SHE_TEST_NOW);
  process.env.SHE_TEST_CLOCK_OFFSET_MS = String(at - Date.now());
  const preload = "--import=" + pathToFileURL(resolve("tests/fixed-now.preload.mjs")).href;
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, preload].filter(Boolean).join(" ");
}

export default defineConfig({
  test: {
    // Isolated build copies under work/ are artifacts, not additional test suites.
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/fixed-now.preload.mjs"],
  },
});
