import { beforeEach, describe, expect, it } from "vitest";

import {
  checkLock,
  clearFailures,
  loginKeys,
  MAX_ATTEMPTS,
  recordFailure,
  WINDOW_MS,
} from "../lib/rate-limit";
import { hashToken, issueAuthToken, lookupAuthToken } from "../lib/auth-tokens";
import { db, makeUser, resetDb } from "./setup/db";

describe("login rate limiting", () => {
  beforeEach(async () => {
    await db.loginAttempt.deleteMany();
  });

  const keys = ["email:someone@studio.com", "ip:203.0.113.9"];

  it("counts the address only when it is known", () => {
    // The keys are a keyed hash of the email and the address, never the values
    // themselves — see tests/retention.ts for that part. Here: how many
    // buckets an attempt counts against.
    expect(loginKeys("A@Studio.com", "1.2.3.4")).toHaveLength(2);
    expect(loginKeys("a@studio.com", null)).toHaveLength(1);
    // An unknown address would be one shared bucket for everyone behind it.
    expect(loginKeys("a@studio.com", "unknown")).toHaveLength(1);

    // Case and stray whitespace still land on the same bucket.
    expect(loginKeys("A@Studio.com ", "1.2.3.4")).toEqual(
      loginKeys("a@studio.com", "1.2.3.4"),
    );
  });

  it("stays unlocked below the threshold", async () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      const state = await recordFailure(keys);
      expect(state.locked).toBe(false);
    }
    expect((await checkLock(keys)).locked).toBe(false);
  });

  it("locks on the nth failure and reports how long to wait", async () => {
    let state = { locked: false } as Awaited<ReturnType<typeof recordFailure>>;
    for (let i = 0; i < MAX_ATTEMPTS; i++) state = await recordFailure(keys);

    expect(state.locked).toBe(true);
    const after = await checkLock(keys);
    expect(after.locked).toBe(true);
    if (after.locked) expect(after.retryAfterMs).toBeGreaterThan(0);
  });

  it("locks the email even when the attacker rotates addresses", async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await recordFailure(loginKeys("victim@studio.com", `10.0.0.${i}`));
    }
    expect(
      (await checkLock(loginKeys("victim@studio.com", "10.0.0.99"))).locked,
    ).toBe(true);
  });

  it("a successful sign-in clears the counter", async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) await recordFailure(keys);
    await clearFailures(keys);
    expect((await checkLock(keys)).locked).toBe(false);
  });

  it("starts a fresh window once the old one has passed", async () => {
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await recordFailure(keys);

    // Age the window past its expiry rather than waiting fifteen minutes.
    await db.loginAttempt.updateMany({
      where: { key: keys[0] },
      data: { windowStart: new Date(Date.now() - WINDOW_MS - 1000) },
    });

    const state = await recordFailure([keys[0]!]);
    expect(state.locked).toBe(false);
    const row = await db.loginAttempt.findUniqueOrThrow({
      where: { key: keys[0]! },
    });
    expect(row.count).toBe(1);
  });

  it("keeps a live lock even after the window would have rolled over", async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) await recordFailure([keys[0]!]);
    await db.loginAttempt.updateMany({
      where: { key: keys[0] },
      data: { windowStart: new Date(Date.now() - WINDOW_MS - 1000) },
    });
    expect((await checkLock([keys[0]!])).locked).toBe(true);
  });
});

describe("auth tokens", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stores only a hash of the token", async () => {
    const user = await makeUser();
    const issued = await issueAuthToken({ userId: user.id, kind: "INVITE" });

    const rows = await db.authToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(issued.token));
    // The raw token must not be recoverable from the database.
    expect(rows[0]!.tokenHash).not.toContain(issued.token);
  });

  it("accepts a fresh token and identifies its owner", async () => {
    const user = await makeUser();
    const issued = await issueAuthToken({ userId: user.id, kind: "RESET" });

    const lookup = await lookupAuthToken(issued.token);
    expect(lookup.ok).toBe(true);
    if (lookup.ok) {
      expect(lookup.user.id).toBe(user.id);
      expect(lookup.kind).toBe("RESET");
    }
  });

  it("rejects an unknown or malformed token", async () => {
    expect((await lookupAuthToken("")).ok).toBe(false);
    expect((await lookupAuthToken("short")).ok).toBe(false);

    const bogus = await lookupAuthToken("x".repeat(43));
    expect(bogus.ok).toBe(false);
    if (!bogus.ok) expect(bogus.reason).toBe("invalid");
  });

  it("rejects a token that was already used", async () => {
    const user = await makeUser();
    const issued = await issueAuthToken({ userId: user.id, kind: "RESET" });
    await db.authToken.updateMany({ data: { usedAt: new Date() } });

    const lookup = await lookupAuthToken(issued.token);
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.reason).toBe("used");
  });

  it("rejects an expired token", async () => {
    const user = await makeUser();
    const issued = await issueAuthToken({ userId: user.id, kind: "RESET" });
    await db.authToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const lookup = await lookupAuthToken(issued.token);
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.reason).toBe("expired");
  });

  it("rejects a token for a disabled account", async () => {
    const user = await makeUser({ isActive: false });
    const issued = await issueAuthToken({ userId: user.id, kind: "INVITE" });

    const lookup = await lookupAuthToken(issued.token);
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) expect(lookup.reason).toBe("inactive");
  });

  it("invalidates the previous link when a new one is issued", async () => {
    const user = await makeUser();
    const first = await issueAuthToken({ userId: user.id, kind: "RESET" });
    const second = await issueAuthToken({ userId: user.id, kind: "RESET" });

    expect((await lookupAuthToken(first.token)).ok).toBe(false);
    expect((await lookupAuthToken(second.token)).ok).toBe(true);
    expect(await db.authToken.count()).toBe(1);
  });

  it("gives an invite a longer life than a reset", async () => {
    const user = await makeUser();
    const invite = await issueAuthToken({ userId: user.id, kind: "INVITE" });
    const other = await makeUser();
    const reset = await issueAuthToken({ userId: other.id, kind: "RESET" });

    expect(invite.expiresAt.getTime()).toBeGreaterThan(
      reset.expiresAt.getTime(),
    );
  });

  it("points the link at the set-password page", async () => {
    const user = await makeUser();
    const issued = await issueAuthToken({ userId: user.id, kind: "INVITE" });
    expect(issued.url).toContain(`/set-password/${issued.token}`);
  });
});
