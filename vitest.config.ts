import path from "node:path";

import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Tests talk to a real Postgres — these functions are mostly queries, and
// mocking Prisma would only test the mock. `.env.test` points at a separate
// database so a stray truncate can never touch development data.
config({ path: ".env.test", override: true });

export default defineConfig({
  // Route handlers under test import through the app alias.
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  // tsconfig leaves JSX alone for Next to compile, which is right for the app
  // and leaves a test file with syntax the runner cannot read. Transform it
  // here instead of changing what the build does.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    // .tsx as well, because the one thing a form component has to be held to
    // is the markup it produces.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globalSetup: ["tests/setup/global-setup.ts"],
    // One shared database, so files must not run at the same time.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20000,
  },
});
