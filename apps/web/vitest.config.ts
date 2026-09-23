import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig.json, without pulling in a
    // tsconfig-paths plugin dependency for one alias. [A]
    alias: {
      "@": import.meta.dirname,
    },
  },
});
