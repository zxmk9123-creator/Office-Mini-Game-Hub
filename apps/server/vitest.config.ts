import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests share one real Postgres database and truncate tables between
    // cases; running test files in parallel would race those truncations.
    fileParallelism: false,
  },
});
