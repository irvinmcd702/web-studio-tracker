import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { startFakeSmtp, type FakeSmtp } from "./setup/smtp";

/**
 * Nothing else in the suite goes near lib/mail.ts, which meant a nodemailer
 * upgrade could change what travels over the socket and every one of the other
 * tests would still pass. These drive the real module through a real SMTP
 * transaction, so the thing being checked is delivery rather than the shape of
 * an API.
 *
 * The module caches its transport on first use, so anything that needs a
 * different configuration re-imports it rather than reaching inside.
 */

const FROM = "Studio Tracker <no-reply@studio.invalid>";

let smtp: FakeSmtp;
let mail: typeof import("../lib/mail");

beforeAll(async () => {
  smtp = await startFakeSmtp();

  process.env.SMTP_URL = `smtp://127.0.0.1:${smtp.port}`;
  process.env.MAIL_FROM = FROM;

  vi.resetModules();
  mail = await import("../lib/mail");
});

afterAll(async () => {
  await smtp.close();
  delete process.env.SMTP_URL;
  delete process.env.MAIL_FROM;
});

describe("sending mail", () => {
  it("reaches the server it was configured with", async () => {
    expect(mail.isMailConfigured()).toBe(true);
    await expect(mail.verifyMail()).resolves.toEqual({ ok: true });
  });

  it("delivers an invite the recipient can act on", async () => {
    const letter = mail.inviteEmail({
      name: "Ada",
      link: "http://localhost:3000/set-password/one-time-token",
      studioName: "Ink & Pixel",
      expiresAt: new Date("2030-01-01T00:00:00Z"),
    });

    const sent = await mail.sendMail({
      to: "ada@example.com",
      subject: letter.subject,
      text: letter.text,
    });

    expect(sent).toEqual({ ok: true });

    // What matters is not that sendMail returned, but that a message with the
    // link in it actually crossed the wire.
    const message = smtp.messages.at(-1) ?? "";
    expect(message).toContain("no-reply@studio.invalid");
    expect(message).toContain("ada@example.com");
    expect(message).toContain("Your Studio Tracker account");
    expect(message).toContain("/set-password/one-time-token");
  });

  it("hands a refusal back instead of throwing into the caller", async () => {
    // A caller in the middle of inviting somebody must still be able to show
    // the one-time link by hand when the mail server says no.
    smtp.refuse = true;
    const before = smtp.messages.length;

    try {
      const result = await mail.sendMail({
        to: "nobody@example.com",
        subject: "Test",
        text: "Test",
      });

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ configured: true });
      expect(smtp.messages).toHaveLength(before);
    } finally {
      smtp.refuse = false;
    }
  });

  it("redacts the address it logs, but not the one it returns", async () => {
    // The comment in lib/mail.ts promises exactly this split: a server log is
    // not the place for a recipient, and the caller still needs the whole
    // message to show or store.
    smtp.refuse = true;
    const logged: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      });

    try {
      const result = await mail.sendMail({
        to: "ada@example.com",
        subject: "Test",
        text: "Test",
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("unreachable");

      expect(result.error).toContain("ada@example.com");
      expect(logged.join("\n")).toContain("<redacted>");
      expect(logged.join("\n")).not.toContain("ada@example.com");
    } finally {
      spy.mockRestore();
      smtp.refuse = false;
    }
  });

  it("says it is unconfigured rather than opening a connection", async () => {
    const url = process.env.SMTP_URL;
    delete process.env.SMTP_URL;
    const before = smtp.messages.length;

    try {
      expect(mail.isMailConfigured()).toBe(false);
      await expect(mail.sendMail({ to: "a@b.com", subject: "s", text: "t" }))
        .resolves.toMatchObject({ ok: false, configured: false });
      await expect(mail.verifyMail()).resolves.toMatchObject({
        ok: false,
        configured: false,
      });
      expect(smtp.messages).toHaveLength(before);
    } finally {
      process.env.SMTP_URL = url;
    }
  });

  it("builds a transport from host and port as well as from a URL", async () => {
    // Both halves of transport() are reachable in deployment — DEPLOY.md
    // documents the URL, but the discrete variables are what a compose file
    // usually ends up with.
    const url = process.env.SMTP_URL;
    delete process.env.SMTP_URL;
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(smtp.port);

    try {
      vi.resetModules();
      const fresh = await import("../lib/mail");

      expect(fresh.isMailConfigured()).toBe(true);
      await expect(fresh.verifyMail()).resolves.toEqual({ ok: true });

      const sent = await fresh.sendMail({
        to: "grace@example.com",
        subject: "Reset your Studio Tracker password",
        text: "http://localhost:3000/set-password/another-token",
      });

      expect(sent).toEqual({ ok: true });
      expect(smtp.messages.at(-1)).toContain("grace@example.com");
    } finally {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      process.env.SMTP_URL = url;
    }
  });
});

describe("redacting addresses", () => {
  it("removes an address from the middle of an SMTP rejection", () => {
    expect(
      mail.redactAddresses("550 5.1.1 <ada@example.com>: user unknown"),
    ).toBe("550 5.1.1 <<redacted>>: user unknown");
  });

  it("removes every address, not only the first", () => {
    expect(mail.redactAddresses("a@b.com and c.d+tag@e.f.org")).toBe(
      "<redacted> and <redacted>",
    );
  });

  it("leaves a message with nothing to hide alone", () => {
    expect(mail.redactAddresses("Connection timed out")).toBe(
      "Connection timed out",
    );
  });
});

describe("the two letters", () => {
  const expiresAt = new Date("2030-01-01T00:00:00Z");

  it("puts the link and its expiry in the invite", () => {
    const letter = mail.inviteEmail({
      name: "Ada",
      link: "https://tracker.studio/set-password/abc",
      studioName: "Ink & Pixel",
      expiresAt,
    });

    expect(letter.subject).toBe("Your Studio Tracker account");
    expect(letter.text).toContain("Hello Ada,");
    expect(letter.text).toContain("Ink & Pixel");
    expect(letter.text).toContain("https://tracker.studio/set-password/abc");
    expect(letter.text).toContain(expiresAt.toUTCString());
  });

  it("names the studio generically when nobody has set one", () => {
    const letter = mail.inviteEmail({
      name: "Ada",
      link: "https://tracker.studio/set-password/abc",
      expiresAt,
    });

    expect(letter.text).toContain("the studio's project tracker");
  });

  it("tells a reset recipient that ignoring it is safe", () => {
    const letter = mail.resetEmail({
      name: "Grace",
      link: "https://tracker.studio/set-password/xyz",
      expiresAt,
    });

    expect(letter.subject).toBe("Reset your Studio Tracker password");
    expect(letter.text).toContain("https://tracker.studio/set-password/xyz");
    // The letter is hard-wrapped, so the reassurance spans two lines.
    expect(letter.text).toContain("nothing has changed");
    expect(letter.text).toContain("old password still works");
  });
});
