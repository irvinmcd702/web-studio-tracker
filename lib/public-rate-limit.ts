import { limitKey } from "./rate-limit";
import { prisma } from "./db";

/**
 * A limiter for the pages anybody on the internet can reach.
 *
 * There are two of them — the intake form and the unsubscribe routes — and
 * until this file neither counted anything at all. `submitPublicRequestAction`
 * has been unauthenticated and unlimited since it was written; adding a second
 * public endpoint is what forced the issue rather than what created it.
 *
 * It reuses `limitKey` from `lib/rate-limit.ts` and the `LoginAttempt` table
 * behind it, for the reasons that file already gives: the counter lives in the
 * database so it survives a restart and holds across instances, and what lands
 * in the table is an HMAC rather than an address. Rotating `AUTH_SECRET`
 * resets every counter, which is harmless here — the worst case is that one
 * visitor gets a fresh allowance on the day of a rotation.
 *
 * Deliberately looser than the sign-in lockout. That one is guarding accounts
 * and can afford to be strict; these are guarding a mailbox and a table from
 * flooding, and a limit that refuses a real enquiry is worse than the flood.
 */

const WINDOW_MS = 60 * 60 * 1000;

/** Per hour, per address, per endpoint. */
const ALLOWANCE: Record<PublicAction, number> = {
  intake: 10,
  unsubscribe: 20,
};

export type PublicAction = "intake" | "unsubscribe";

export type LimitVerdict = { ok: true } | { ok: false; retryAfterMs: number };

export function publicKey(action: PublicAction, ip: string | null) {
  // An unknown address would otherwise become one shared bucket for everyone
  // behind it, exactly as in the sign-in limiter.
  if (!ip || ip === "unknown") return null;
  return limitKey(`public-${action}`, ip);
}

/**
 * Counts this attempt and says whether it is allowed.
 *
 * Counts first and refuses after, so a caller cannot spend the allowance by
 * checking without acting. Never throws: a limiter that takes the form down
 * when the database hiccups has made the outage worse.
 */
export async function allowPublic(
  action: PublicAction,
  ip: string | null,
  { now = new Date() }: { now?: Date } = {},
): Promise<LimitVerdict> {
  const key = publicKey(action, ip);
  if (!key) return { ok: true };

  try {
    const existing = await prisma.loginAttempt.findUnique({ where: { key } });

    const windowExpired =
      !existing || now.getTime() - existing.windowStart.getTime() > WINDOW_MS;
    const count = windowExpired ? 1 : existing.count + 1;

    await prisma.loginAttempt.upsert({
      where: { key },
      create: { key, count, windowStart: now },
      update: { count, ...(windowExpired ? { windowStart: now } : {}) },
    });

    if (count <= ALLOWANCE[action]) return { ok: true };

    const startedAt = windowExpired ? now : existing!.windowStart;
    return {
      ok: false,
      retryAfterMs: Math.max(
        0,
        startedAt.getTime() + WINDOW_MS - now.getTime(),
      ),
    };
  } catch {
    return { ok: true };
  }
}
