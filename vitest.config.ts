import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Isolated build copies under work/ are artifacts, not additional test suites.
    include: ["tests/**/*.test.ts"],
  },
});
