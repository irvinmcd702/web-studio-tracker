import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { startFakeSmtp, type FakeSmtp } from "./setup/smtp";

/**
 * Two channels, two servers, and the guarantee that they never swap.
 *
 * The whole reason outreach has its own transport is that a spam complaint
 * about cold mail must not take invites and password resets down with it. That
 * promise is only worth anything if it holds when somebody forgets a variable,
 * so the assertion below is not "outreach refused" but "**the transactional
 * server received nothing**".
 */

const TRANSACTIONAL_FROM = "Studio Tracker <no-reply@studio.invalid>";
const OUTREACH_FROM = "Northwind <hello@hi.studio.example>";

let transactional: FakeSmtp;
let outreach: FakeSmtp;
let mail: typeof import("../lib/mail");

beforeAll(async () => {
  transactional = await startFakeSmtp();
  outreach = await startFakeSmtp();

  process.env.SMTP_URL = `smtp://127.0.0.1:${transactional.port}`;
  process.env.MAIL_FROM = TRANSACTIONAL_FROM;
  process.env.OUTREACH_SMTP_URL = `smtp://127.0.0.1:${outreach.port}`;
  process.env.OUTREACH_MAIL_FROM = OUTREACH_FROM;

  vi.resetModules();
  mail = await import("../lib/mail");
});

afterAll(async () => {
  await transactional.close();
  await outreach.close();
  delete process.env.SMTP_URL;
  delete process.env.MAIL_FROM;
  delete process.env.OUTREACH_SMTP_URL;
  delete process.env.OUTREACH_MAIL_FROM;
});

beforeEach(() => {
  transactional.messages.length = 0;
  outreach.messages.length = 0;
});

describe("the two channels are separate", () => {
  it("takes outreach to the outreach server and nowhere else", async () => {
    const sent = await mail.sendOutreachMail({
      to: "ada@example.com",
      subject: "A quick question",
      text: "Hello,\n\nA message.",
    });

    expect(sent).toEqual({ ok: true });
    expect(outreach.messages).toHaveLength(1);
    expect(transactional.messages).toHaveLength(0);
    expect(outreach.messages[0]).toContain(OUTREACH_FROM);
  });

  it("takes an invite to the transactional server and nowhere else", async () => {
    const invite = mail.inviteEmail({
      name: "Ada",
      link: "https://tracker.example/set-password/token",
      expiresAt: new Date("2026-08-14T00:00:00Z"),
    });
    await mail.sendMail({ to: "ada@studio.com", ...invite });

    expect(transactional.messages).toHaveLength(1);
    expect(outreach.messages).toHaveLength(0);
  });

  it("verifies each set of credentials against its own server", async () => {
    await expect(mail.verifyMail()).resolves.toEqual({ ok: true });
    await expect(mail.verifyOutreachMail()).resolves.toEqual({ ok: true });
  });
});

describe("outreach never falls back", () => {
  it("refuses when only the transactional variables are set", async () => {
    const url = process.env.OUTREACH_SMTP_URL;
    delete process.env.OUTREACH_SMTP_URL;

    try {
      vi.resetModules();
      const fresh = await import("../lib/mail");

      expect(fresh.isMailConfigured()).toBe(true);
      expect(fresh.isOutreachMailConfigured()).toBe(false);

      const sent = await fresh.sendOutreachMail({
        to: "ada@example.com",
        subject: "A quick question",
        text: "Hello,\n\nA message.",
      });

      expect(sent).toMatchObject({ ok: false, configured: false });
      // The assertion that matters: nothing leaked onto the channel that
      // carries invites and password resets.
      expect(transactional.messages).toHaveLength(0);
      expect(outreach.messages).toHaveLength(0);
    } finally {
      process.env.OUTREACH_SMTP_URL = url;
      vi.resetModules();
      mail = await import("../lib/mail");
    }
  });

  it("refuses when the from-address is missing, however the server is set up", async () => {
    const from = process.env.OUTREACH_MAIL_FROM;
    delete process.env.OUTREACH_MAIL_FROM;

    try {
      vi.resetModules();
      const fresh = await import("../lib/mail");

      // No fallback to MAIL_FROM: outreach going out under the transactional
      // address is the exact failure the second channel exists to prevent.
      expect(fresh.outreachMailFrom()).toBeNull();
      await expect(
        fresh.sendOutreachMail({ to: "a@b.com", subject: "s", text: "t" }),
      ).resolves.toMatchObject({ ok: false, configured: false });
      expect(outreach.messages).toHaveLength(0);
      expect(transactional.messages).toHaveLength(0);
    } finally {
      process.env.OUTREACH_MAIL_FROM = from;
      vi.resetModules();
      mail = await import("../lib/mail");
    }
  });

  it("builds an outreach transport from host and port as well as a URL", async () => {
    const url = process.env.OUTREACH_SMTP_URL;
    delete process.env.OUTREACH_SMTP_URL;
    process.env.OUTREACH_SMTP_HOST = "127.0.0.1";
    process.env.OUTREACH_SMTP_PORT = String(outreach.port);

    try {
      vi.resetModules();
      const fresh = await import("../lib/mail");

      expect(fresh.isOutreachMailConfigured()).toBe(true);
      await expect(
        fresh.sendOutreachMail({ to: "a@b.com", subject: "s", text: "t" }),
      ).resolves.toEqual({ ok: true });
      expect(outreach.messages).toHaveLength(1);
    } finally {
      delete process.env.OUTREACH_SMTP_HOST;
      delete process.env.OUTREACH_SMTP_PORT;
      process.env.OUTREACH_SMTP_URL = url;
      vi.resetModules();
      mail = await import("../lib/mail");
    }
  });
});

describe("what crosses the wire", () => {
  it("carries the one-click headers and the reply address", async () => {
    await mail.sendOutreachMail({
      to: "ada@example.com",
      subject: "A quick question",
      text: "Hello,\n\nA message.",
      replyTo: "outreach+abc123@hi.studio.example",
      messageId: "<one@hi.studio.example>",
      headers: {
        "List-Unsubscribe":
          "<mailto:unsubscribe@hi.studio.example>, <https://tracker.example/unsubscribe/t>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        Precedence: "bulk",
      },
    });

    const wire = outreach.messages[0]!;
    expect(wire).toContain("Reply-To: outreach+abc123@hi.studio.example");
    expect(wire).toContain("Message-ID: <one@hi.studio.example>");
    expect(wire).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(wire).toContain("Precedence: bulk");
  });

  it("gives sendMail no way to carry those headers at all", () => {
    // Not a stylistic point: the absence of the parameter is what makes it
    // impossible for an invite to go out looking like bulk mail.
    const source = mail.sendMail.toString();
    expect(source).not.toContain("headers");
  });

  it("redacts an address out of an outreach rejection in the log", async () => {
    outreach.refuse = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const result = await mail.sendOutreachMail({
        to: "ada@example.com",
        subject: "s",
        text: "t",
      });

      expect(result).toMatchObject({ ok: false, configured: true });
      const logged = spy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("<redacted>");
      expect(logged).not.toContain("ada@example.com");
    } finally {
      spy.mockRestore();
      outreach.refuse = false;
    }
  });
});
