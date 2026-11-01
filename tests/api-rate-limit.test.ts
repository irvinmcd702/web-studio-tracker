import { beforeEach, describe, expect, it } from "vitest";

import {
  API_RATE_LIMITS,
  checkApiRate,
  resetApiRateLimits,
} from "../lib/api-rate-limit";

const { READ_LIMIT, WRITE_LIMIT, WINDOW_MS } = API_RATE_LIMITS;

describe("api rate limit", () => {
  beforeEach(() => resetApiRateLimits());

  it("lets a normal amount of traffic through", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkApiRate("token-a").ok).toBe(true);
    }
  });

  it("stops a token that keeps reading past the ceiling", () => {
    for (let i = 0; i < READ_LIMIT; i++) checkApiRate("token-b");

    const verdict = checkApiRate("token-b");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.limit).toBe(READ_LIMIT);
      expect(verdict.retryAfterSeconds).toBeGreaterThan(0);
      expect(verdict.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("holds writes to a tighter budget than reads", () => {
    for (let i = 0; i < WRITE_LIMIT; i++) {
      expect(checkApiRate("token-c", { write: true }).ok).toBe(true);
    }

    // Writes are spent…
    expect(checkApiRate("token-c", { write: true }).ok).toBe(false);
    // …but the token can still read, because reading is not the expensive part.
    expect(checkApiRate("token-c").ok).toBe(true);
  });

  it("counts each token on its own", () => {
    for (let i = 0; i < READ_LIMIT; i++) checkApiRate("noisy");

    expect(checkApiRate("noisy").ok).toBe(false);
    expect(checkApiRate("quiet").ok).toBe(true);
  });

  it("forgives once the window has passed", () => {
    const start = 1_000_000;
    for (let i = 0; i < READ_LIMIT; i++) checkApiRate("token-d", {}, start);

    expect(checkApiRate("token-d", {}, start).ok).toBe(false);
    expect(checkApiRate("token-d", {}, start + WINDOW_MS + 1).ok).toBe(true);
  });
});
