import nodemailer, { type Transporter } from "nodemailer";

import { appUrl } from "./rocketchat";

/**
 * Outgoing email, on two channels that never touch each other.
 *
 * **Transactional** — invites and password resets. `SMTP_*`.
 * **Outreach** — cold messages to people who did not ask to hear from the
 * studio. `OUTREACH_SMTP_*`, and meant to be a different subdomain with
 * different credentials.
 *
 * Two rules, both enforced below and both covered by tests:
 *
 * 1. **Outreach never falls back to the transactional transport.** With
 *    `OUTREACH_SMTP_*` unset, `sendOutreachMail` refuses and the scheduler
 *    does nothing. The entire point of a second channel is that a spam
 *    complaint about outreach cannot take invites and password resets down
 *    with it, and a fallback would quietly undo that on the day somebody
 *    forgot a variable.
 * 2. **`sendMail` grows no `headers` parameter.** That is what makes it
 *    impossible for an invite to leave the building carrying
 *    `List-Unsubscribe`.
 *
 * Both are configured through the environment rather than the settings screen,
 * because an SMTP password is infrastructure, not a preference — it belongs
 * with the database URL and the auth secret, where it can be rotated by
 * whoever runs the server without touching the database.
 *
 * Nothing here throws into a user flow. When mail is not configured, or the
 * server refuses, the caller falls back to showing the one-time link so a
 * manager can pass it on by hand, exactly as before.
 */

export type MailResult =
  { ok: true } | { ok: false; error: string; configured: boolean };

/**
 * Which set of environment variables a transport is built from.
 *
 * Note that everything is read from `process.env` at call time and the cache
 * is a module-level variable. `tests/mail.test.ts` deletes `SMTP_URL`
 * mid-test and expects the answer to change, and re-imports the module to get
 * a different transport. Hoisting configuration into a module constant would
 * break that file, and would make the settings screen lie after a rotation.
 */
type Channel = "transactional" | "outreach";

const cached: Partial<Record<Channel, Transporter>> = {};

function envFor(channel: Channel) {
  const p = channel === "outreach" ? "OUTREACH_SMTP_" : "SMTP_";
  return {
    url: process.env[`${p}URL`],
    host: process.env[`${p}HOST`],
    port: process.env[`${p}PORT`],
    user: process.env[`${p}USER`],
    password: process.env[`${p}PASSWORD`],
  };
}

export function isMailConfigured() {
  return Boolean(process.env.SMTP_URL || process.env.SMTP_HOST);
}

/** Outreach is configured separately, or it is not configured at all. */
export function isOutreachMailConfigured() {
  const env = envFor("outreach");
  return Boolean(env.url || env.host);
}

export function mailFrom() {
  return process.env.MAIL_FROM ?? "Studio Tracker <no-reply@studio.invalid>";
}

/**
 * No fallback to `MAIL_FROM`. An outreach message going out under the
 * transactional address is the exact failure the second channel exists to
 * prevent, so an install that has not set this cannot send outreach at all.
 */
export function outreachMailFrom() {
  return process.env.OUTREACH_MAIL_FROM ?? null;
}

function transport(channel: Channel = "transactional") {
  const existing = cached[channel];
  if (existing) return existing;

  const env = envFor(channel);

  // A single URL is the least error-prone way to configure this:
  // smtp://user:pass@host:587 or smtps://…:465
  if (env.url) {
    cached[channel] = nodemailer.createTransport(env.url);
    return cached[channel]!;
  }

  const port = Number(env.port ?? 587);

  cached[channel] = nodemailer.createTransport({
    host: env.host,
    port,
    // 465 is implicit TLS; everything else upgrades with STARTTLS.
    secure: port === 465,
    auth: env.user ? { user: env.user, pass: env.password } : undefined,
  });

  return cached[channel]!;
}

export async function sendMail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}): Promise<MailResult> {
  if (!isMailConfigured()) {
    return {
      ok: false,
      configured: false,
      error: "SMTP is not configured on this server",
    };
  }

  try {
    await transport().sendMail({
      from: mailFrom(),
      to,
      subject,
      text,
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown mail error";
    // An SMTP rejection quotes the address back at you ("550 … <x@y.com>"),
    // and a server log is not the place for it. The caller still gets the
    // whole message; only the log is redacted.
    console.error("[mail]", redactAddresses(error));
    return { ok: false, configured: true, error };
  }
}

/** Replaces anything shaped like an email address with `<redacted>`. */
export function redactAddresses(text: string) {
  return text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<redacted>");
}

/** Tests and the settings screen: prove the credentials work at all. */
export async function verifyMail(): Promise<MailResult> {
  if (!isMailConfigured()) {
    return {
      ok: false,
      configured: false,
      error: "SMTP is not configured on this server",
    };
  }

  try {
    await transport().verify();
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown mail error";
    return { ok: false, configured: true, error };
  }
}

/**
 * The two letters this app sends. Plain text on purpose: they carry one link
 * each, they have to survive every client, and nobody needs a banner image to
 * be told their account is ready.
 */
export function inviteEmail({
  name,
  link,
  studioName = "the studio",
  expiresAt,
}: {
  name: string;
  link: string;
  studioName?: string;
  expiresAt: Date;
}) {
  return {
    subject: "Your Studio Tracker account",
    text: [
      `Hello ${name},`,
      "",
      `An account has been created for you in ${studioName}'s project tracker.`,
      "Pick your own password here:",
      "",
      link,
      "",
      `The link works once and expires on ${expiresAt.toUTCString()}.`,
      "Nobody at the studio can see the password you choose.",
      "",
      appUrl(),
    ].join("\n"),
  };
}

export function resetEmail({
  name,
  link,
  expiresAt,
}: {
  name: string;
  link: string;
  expiresAt: Date;
}) {
  return {
    subject: "Reset your Studio Tracker password",
    text: [
      `Hello ${name},`,
      "",
      "Someone asked to reset the password for this account. If that was you,",
      "choose a new one here:",
      "",
      link,
      "",
      `The link works once and expires on ${expiresAt.toUTCString()}.`,
      "If it wasn't you, ignore this message — nothing has changed, and the",
      "old password still works.",
      "",
      appUrl(),
    ].join("\n"),
  };
}

/**
 * One outreach message.
 *
 * Separate from `sendMail` rather than a flag on it, so the two channels
 * cannot be confused at a call site and so the header parameter exists on
 * exactly one of them. `lib/outreach-send.ts` is the only caller.
 */
export async function sendOutreachMail({
  to,
  subject,
  text,
  replyTo,
  messageId,
  headers,
}: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  /** Ours, so a reply can be threaded back to the message it answers. */
  messageId?: string;
  headers?: Record<string, string>;
}): Promise<MailResult> {
  const from = outreachMailFrom();

  if (!isOutreachMailConfigured() || !from) {
    return {
      ok: false,
      configured: false,
      // Named, because the usual cause is that somebody set up the
      // transactional variables and assumed outreach would follow.
      error:
        "Outreach mail is not configured on this server — set OUTREACH_SMTP_URL (or OUTREACH_SMTP_HOST) and OUTREACH_MAIL_FROM",
    };
  }

  try {
    await transport("outreach").sendMail({
      from,
      to,
      subject,
      text,
      replyTo,
      messageId,
      headers,
    });
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown mail error";
    console.error("[outreach-mail]", redactAddresses(error));
    return { ok: false, configured: true, error };
  }
}

/** The settings screen, proving the second set of credentials works at all. */
export async function verifyOutreachMail(): Promise<MailResult> {
  if (!isOutreachMailConfigured()) {
    return {
      ok: false,
      configured: false,
      error: "Outreach mail is not configured on this server",
    };
  }

  try {
    await transport("outreach").verify();
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown mail error";
    return { ok: false, configured: true, error };
  }
}
