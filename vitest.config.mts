import path from "node:path"
import { defineConfig } from "vitest/config"

const root = path.resolve(import.meta.dirname)

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // `server-only` throws outside React Server Components; tests run server code directly.
      "server-only": path.join(root, "test/stubs/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          setupFiles: ["test/integration/setup.ts"],
          // Tests share one database, so run files one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      // All server-side code: data access, API routes, admin actions, auth proxy and startup.
      include: ["lib/**/*.ts", "app/api/**/*.ts", "app/admin/actions.ts", "proxy.ts", "instrumentation.ts"],
      exclude: ["lib/types.ts"],
      reporter: ["text", "html", "lcov"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
})
