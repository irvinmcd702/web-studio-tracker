import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bootstrapAdmin } from "../lib/bootstrap";
import { db, makeUser, resetDb } from "./setup/db";

describe("the first administrator", () => {
  let logged: string[];

  beforeEach(async () => {
    await resetDb();
    logged = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logged.push(args.join(" "));
    });
    process.env.AUTH_SECRET = "a-secret-for-the-token-hash";
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_NAME;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_NAME;
  });

  it("does nothing at all without the variable", async () => {
    await bootstrapAdmin();
    expect(await db.user.count()).toBe(0);
  });

  it("creates an administrator nobody has a password for", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "  Owner@Studio.com  ";
    process.env.BOOTSTRAP_ADMIN_NAME = "Studio Owner";

    await bootstrapAdmin();

    const user = await db.user.findUniqueOrThrow({
      where: { email: "owner@studio.com" },
    });
    expect(user.role).toBe("ADMIN");
    expect(user.name).toBe("Studio Owner");
    // Unusable on purpose: the owner picks their own through the link.
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.passwordHash).not.toContain("owner");
  });

  it("issues a one-time link and prints it once", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "owner@studio.com";

    await bootstrapAdmin();

    const tokens = await db.authToken.findMany();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.kind).toBe("INVITE");
    expect(tokens[0]!.usedAt).toBeNull();

    const output = logged.join("\n");
    expect(output).toContain("First administrator created");
    expect(output).toContain("/set-password/");
    // Only the hash is stored; the plaintext exists in the log and nowhere else.
    expect(tokens[0]!.tokenHash).not.toContain("set-password");
  });

  it("refuses on a database that already has anyone in it", async () => {
    // Not "no admins" — anyone. A tracker in use can never be reopened here.
    await makeUser({ role: "MEMBER" });
    process.env.BOOTSTRAP_ADMIN_EMAIL = "attacker@example.com";

    await bootstrapAdmin();

    expect(await db.user.count()).toBe(1);
    expect(
      await db.user.findUnique({ where: { email: "attacker@example.com" } }),
    ).toBeNull();
    expect(logged.join("\n")).toContain("already exist");
  });

  it("does not run twice", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAIL = "owner@studio.com";

    await bootstrapAdmin();
    await bootstrapAdmin();

    expect(await db.user.count()).toBe(1);
    expect(await db.authToken.count()).toBe(1);
  });
});
