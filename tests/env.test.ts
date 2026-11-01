import { describe, expect, it } from "vitest";

import { checkEnv } from "../lib/env";

/** A whole process environment is not something a test wants to construct. */
type Env = Record<string, string | undefined>;

const base: Env = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "a-real-secret-of-sufficient-length",
  APP_URL: "https://tracker.studio.com",
  SMTP_URL: "smtp://user:pass@mail:587",
};

const check = (env: Env) => checkEnv(env as NodeJS.ProcessEnv);

const fatal = (env: Env) =>
  check(env)
    .filter((p) => p.fatal)
    .map((p) => p.key);

describe("environment check", () => {
  it("passes a properly configured production server", () => {
    expect(check({ ...base, NODE_ENV: "production" })).toEqual([]);
  });

  it("refuses to serve the world on the example secret", () => {
    expect(
      fatal({ ...base, NODE_ENV: "production", AUTH_SECRET: "change-me" }),
    ).toContain("AUTH_SECRET");
  });

  it("refuses a secret too short to be worth signing with", () => {
    expect(
      fatal({ ...base, NODE_ENV: "production", AUTH_SECRET: "short" }),
    ).toContain("AUTH_SECRET");
  });

  it("still starts a local production build with the example secret", () => {
    // Trying the real build on your own machine must not require inventing
    // credentials — it warns instead.
    const local = {
      ...base,
      NODE_ENV: "production",
      APP_URL: "http://localhost:3000",
      AUTH_SECRET: "change-me",
    };

    expect(fatal(local)).toEqual([]);
    expect(check(local).map((p) => p.key)).toContain("AUTH_SECRET");
  });

  it("treats a missing address as local rather than fatal", () => {
    const env: Env = { ...base, NODE_ENV: "production" };
    delete env.APP_URL;

    expect(fatal(env)).toEqual([]);
    expect(check(env).map((p) => p.key)).toContain("APP_URL");
  });

  it("tolerates the same values in development", () => {
    expect(
      fatal({ ...base, NODE_ENV: "development", AUTH_SECRET: "change-me" }),
    ).toEqual([]);
  });

  it("warns about plain http and missing mail without blocking the boot", () => {
    const env: Env = {
      ...base,
      NODE_ENV: "production",
      APP_URL: "http://tracker",
    };
    delete env.SMTP_URL;

    const problems = check(env);
    const keys = problems.map((p) => p.key);

    expect(keys).toContain("APP_URL");
    expect(keys).toContain("SMTP_URL");
    expect(problems.every((p) => !p.fatal)).toBe(true);
  });

  it("always treats a missing database as fatal", () => {
    const env: Env = { ...base };
    delete env.DATABASE_URL;
    expect(fatal(env)).toContain("DATABASE_URL");
  });
});
