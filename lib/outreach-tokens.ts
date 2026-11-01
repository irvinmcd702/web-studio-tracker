import { createHmac, timingSafeEqual } from "crypto";

import { appUrl } from "./rocketchat";

/**
 * The unsubscribe link.
 *
 * `lib/auth-tokens.ts` stores only a hash, because those links are credentials
 * that must work exactly once. This one is the opposite in every respect: it
 * has to work forever, repeatedly, from every message ever sent, and it grants
 * nothing except the ability to stop mail to one address. So it is **derived,
 * not stored** — an HMAC over the lead id. Nothing goes in the database, the
 * link is stable across every message, and a leaked dump reveals nothing the
 * `Lead` row did not already hold.
 *
 * The cost is honest and worth naming: rotating `AUTH_SECRET` invalidates
 * links already sitting in people's inboxes. That is why the failure page is
 * not a dead end — it offers a plain form that suppresses by address instead.
 * Both paths end in the same `Suppression` row, which is a better answer than
 * a second secret nobody is ever allowed to rotate.
 */

const LENGTH = 32;

function sign(leadId: string) {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret)
    .update(`unsubscribe:${leadId}`)
    .digest("base64url")
    .slice(0, LENGTH);
}

export function unsubscribeToken(leadId: string) {
  return `${leadId}.${sign(leadId)}`;
}

export function unsubscribeUrl(leadId: string) {
  return appUrl(`/unsubscribe/${unsubscribeToken(leadId)}`);
}

/** The lead id the token vouches for, or null if it does not. */
export function readUnsubscribeToken(raw: string): string | null {
  if (typeof raw !== "string") return null;

  // rsplit: a cuid contains no dot today, but reading from the right means a
  // future id format that does cannot silently break every live link.
  const cut = raw.lastIndexOf(".");
  if (cut <= 0) return null;

  const leadId = raw.slice(0, cut);
  const given = raw.slice(cut + 1);
  if (given.length !== LENGTH) return null;

  const expected = Buffer.from(sign(leadId), "utf8");
  const actual = Buffer.from(given, "utf8");
  if (expected.length !== actual.length) return null;

  return timingSafeEqual(expected, actual) ? leadId : null;
}
