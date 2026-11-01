import type { AuthTokenKind } from "@prisma/client";

import { inviteEmail, isMailConfigured, resetEmail, sendMail } from "./mail";
import type { IssuedToken } from "./auth-tokens";

/**
 * Getting a one-time link to the person it belongs to.
 *
 * With SMTP configured the link is mailed and never shown to whoever pressed
 * the button: a password link that passes through a manager's chat window is a
 * password link that lives in a manager's chat window.
 *
 * Without SMTP the old behaviour stands — the link comes back to the screen to
 * be handed over by hand — and the caller says so plainly rather than
 * pretending an email went out.
 */
export type Delivery = {
  emailed: boolean;
  /** Only set when the link could not be emailed. */
  link?: string;
  expiresAt: string;
  note: string;
};

export async function deliverAuthToken({
  to,
  name,
  kind,
  issued,
}: {
  to: string;
  name: string;
  kind: AuthTokenKind;
  issued: IssuedToken;
}): Promise<Delivery> {
  const expiresAt = issued.expiresAt.toISOString();

  const handOver = (note: string): Delivery => ({
    emailed: false,
    link: issued.url,
    expiresAt,
    note,
  });

  if (!isMailConfigured()) {
    return handOver("No SMTP configured — pass this link on yourself.");
  }

  const letter =
    kind === "INVITE"
      ? inviteEmail({ name, link: issued.url, expiresAt: issued.expiresAt })
      : resetEmail({ name, link: issued.url, expiresAt: issued.expiresAt });

  const result = await sendMail({ to, ...letter });

  if (!result.ok) {
    return handOver(
      `Couldn't send the email (${result.error}) — pass the link on yourself.`,
    );
  }

  return {
    emailed: true,
    expiresAt,
    note:
      kind === "INVITE"
        ? `Invite emailed to ${to}.`
        : `Reset link emailed to ${to}.`,
  };
}
