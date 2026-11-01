import path from "node:path";

import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

/**
 * End-to-end tests, against the real production build and a real browser.
 *
 * The vitest suite already covers the server thoroughly, and covers it in the
 * only place these cannot reach: a permission rule with twelve cases is a unit
 * test, not twelve page loads. What it cannot see is whether the halves are
 * joined — whether the button submits the form the action expects, whether the
 * cookie survives the redirect, whether the page a user is refused actually
 * refuses them. That is the whole of what is here.
 *
 * `.env.e2e` locally, job variables in CI, exactly as the vitest config does.
 * dotenv is a no-op when the file is absent, so both work without a branch.
 */
config({ path: ".env.e2e", override: true });

const PORT = Number(process.env.E2E_PORT ?? 3311);
const baseURL = `http://127.0.0.1:${PORT}`;

// Its own database and its own upload directory. The seed truncates on the way
// in, and pointing that at the vitest database mid-run would be a bad afternoon.
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://tracker:tracker@localhost:5440/studio_tracker_e2e?schema=public";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/setup/global-setup.ts",

  // One worker, one database. The seed builds a single studio, and two tests
  // moving the same ticket at once would fail each other rather than the code.
  // The vitest suite makes the same trade for the same reason.
  workers: 1,
  fullyParallel: false,

  forbidOnly: Boolean(process.env.CI),
  // One retry in CI, none locally. A flake that only ever appears on a shared
  // runner should not block a merge; a flake on your own machine is a bug you
  // want to see.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 45_000,
  // A server action revalidates a route before the page changes. Ten seconds
  // was enough when a test ran alone and not when the suite ran back to back,
  // which is the kind of margin that turns into a flake on somebody else's
  // machine.
  expect: { timeout: 20_000 },

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // The built server, not the dev server. These tests are meant to catch the
    // things that only appear once it is compiled for real — a client
    // component that needed a boundary, a server action that only fails when
    // it is not being recompiled on every keystroke.
    command: "npm run start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL,
      AUTH_SECRET:
        process.env.AUTH_SECRET ??
        "e2e-secret-not-used-for-anything-real-0123456789",
      APP_URL: baseURL,
      // Absolute, because the standalone server runs from .next/standalone and
      // a relative path would quietly put uploads inside the build output.
      UPLOAD_DIR:
        process.env.UPLOAD_DIR ?? path.resolve(__dirname, "uploads-e2e"),
      PORT: String(PORT),
    },
  },
});
