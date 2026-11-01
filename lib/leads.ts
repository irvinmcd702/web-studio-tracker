import type { SuppressionReason } from "@prisma/client";

import { prisma } from "./db";

/**
 * The lead base, and the list of addresses this tracker will not write to.
 *
 * Two rules hold everywhere:
 *
 * 1. **Suppression is checked against `emailKey`, never against a lead id.**
 *    An address can be suppressed with no lead behind it, a lead can be
 *    deleted while the suppression stays, and the same person can arrive twice
 *    in two different lists. The address is the thing that said no.
 * 2. **Nothing here decides a legal basis.** The provenance fields record what
 *    the studio was told; they do not make a list lawful to mail, and the
 *    settings page and PRIVACY.md both say so.
 */

/**
 * The dedup key: trimmed and lowercased, and nothing else.
 *
 * Deliberately not clever. Stripping dots from gmail addresses or cutting
 * `+tags` would be the tracker deciding that two addresses are one person,
 * which is a guess, and a guess that fails in the direction of mailing
 * somebody who thought they had unsubscribed.
 */
export function emailKey(email: string) {
  return email.trim().toLowerCase();
}

/**
 * Good enough to reject a row that is plainly not an address, and no stricter.
 *
 * An import that refuses real addresses because a regular expression disagreed
 * with RFC 5322 is worse than one that lets an odd-looking address through and
 * finds out when it bounces.
 */
export function looksLikeEmail(value: string) {
  const trimmed = value.trim();
  return (
    trimmed.length >= 6 &&
    trimmed.length <= 160 &&
    /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/.test(trimmed)
  );
}

/** Which of these addresses are off limits. Keys, not ids. */
export async function suppressedKeys(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await prisma.suppression.findMany({
    where: { emailKey: { in: keys } },
    select: { emailKey: true },
  });
  return new Set(rows.map((r) => r.emailKey));
}

export async function isSuppressed(email: string) {
  const found = await prisma.suppression.findUnique({
    where: { emailKey: emailKey(email) },
  });
  return Boolean(found);
}

/**
 * Add an address to the list, and mark the lead behind it if there is one.
 *
 * Idempotent on purpose: a one-click unsubscribe that a mail client sends
 * twice, or a person who presses the link again a month later, must both end
 * with one row and a 200. The first reason recorded is kept — what made the
 * address off limits is the first time somebody said so.
 */
export async function suppress(input: {
  email: string;
  reason: SuppressionReason;
  source?: string | null;
  note?: string | null;
}) {
  const key = emailKey(input.email);

  const row = await prisma.suppression.upsert({
    where: { emailKey: key },
    create: {
      emailKey: key,
      reason: input.reason,
      source: input.source ?? null,
      note: input.note ?? null,
    },
    update: {},
  });

  // The lead is a separate record and may not exist. Marking it is bookkeeping
  // for whoever reads the list later; the suppression above is what actually
  // stops the mail.
  const lead = await prisma.lead.findUnique({ where: { emailKey: key } });
  if (lead && lead.status !== "UNSUBSCRIBED") {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "UNSUBSCRIBED" },
    });
  }

  return { suppression: row, lead };
}
