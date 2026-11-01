import { createHmac } from "crypto";

import { prisma } from "./db";

/**
 * Sliding-window lockout for sign-in attempts.
 *
 * Counters live in the database rather than in memory so the limit survives a
 * restart and holds across several app instances — an in-process counter is
 * trivially defeated by hitting a different pod.
 *
 * **The table holds no addresses and no email addresses.** A counter needs to
 * recognise the same visitor twice, which a keyed hash does perfectly well; it
 * does not need to know who they are. So the identifier is HMAC'd before it is
 * written, and what lands in the database is `ip:9f3c…` — enough to count
 * against, useless to anyone reading the table, and nothing to erase later.
 *
 * A side effect worth knowing: rotating `AUTH_SECRET` changes every key, so
 * every lock and every counter resets. That is the right way round — a secret
 * rotation should not carry old lockouts with it.
 */

export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MS = 15 * 60 * 1000;

export type LockState =
  { locked: false } | { locked: true; retryAfterMs: number };

/**
 * `prefix:<hmac>`. Truncated to 32 hex characters: still far beyond collision
 * range for a table this size, and short enough to read in a query.
 */
export function limitKey(prefix: string, value: string) {
  const secret = process.env.AUTH_SECRET ?? "";
  const digest = createHmac("sha256", secret)
    .update(`${prefix}:${value.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
  return `${prefix}:${digest}`;
}

export function loginKeys(email: string, ip: string | null) {
  const keys = [limitKey("email", email)];
  // An unknown address would otherwise become one shared bucket for everyone
  // behind it, so it is simply not counted.
  if (ip && ip !== "unknown") keys.push(limitKey("ip", ip));
  return keys;
}

/** The forgotten-password form counts on its own pair of buckets. */
export function resetKeys(email: string, ip: string | null) {
  const keys = [limitKey("reset", email)];
  if (ip && ip !== "unknown") keys.push(limitKey("reset-ip", ip));
  return keys;
}

export async function checkLock(keys: string[]): Promise<LockState> {
  const now = new Date();
  const rows = await prisma.loginAttempt.findMany({
    where: { key: { in: keys }, lockedUntil: { gt: now } },
    orderBy: { lockedUntil: "desc" },
    take: 1,
  });

  const locked = rows[0];
  if (!locked?.lockedUntil) return { locked: false };

  return {
    locked: true,
    retryAfterMs: locked.lockedUntil.getTime() - now.getTime(),
  };
}

/** Counts a failed attempt against every key, locking whichever tips over. */
export async function recordFailure(keys: string[]): Promise<LockState> {
  const now = new Date();
  let worst: LockState = { locked: false };

  for (const key of keys) {
    const existing = await prisma.loginAttempt.findUnique({ where: { key } });

    // A stale window starts over rather than accumulating forever.
    const windowExpired =
      !existing || now.getTime() - existing.windowStart.getTime() > WINDOW_MS;

    const count = windowExpired ? 1 : existing.count + 1;
    const lockedUntil =
      count >= MAX_ATTEMPTS ? new Date(now.getTime() + LOCKOUT_MS) : null;

    await prisma.loginAttempt.upsert({
      where: { key },
      create: { key, count, windowStart: now, lockedUntil },
      update: {
        count,
        lockedUntil,
        ...(windowExpired ? { windowStart: now } : {}),
      },
    });

    if (lockedUntil) {
      worst = {
        locked: true,
        retryAfterMs: lockedUntil.getTime() - now.getTime(),
      };
    }
  }

  return worst;
}

/** A successful sign-in wipes the slate for that person and address. */
export async function clearFailures(keys: string[]) {
  await prisma.loginAttempt.deleteMany({ where: { key: { in: keys } } });
}

export function formatRetryAfter(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}
