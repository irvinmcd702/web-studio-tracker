import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../app/api/cron/outreach/route";
import { db, resetDb } from "./setup/db";

const SECRET = "a-scheduling-secret";

function call(token?: string) {
  return POST(
    new Request("http://localhost/api/cron/outreach", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }) as never,
  );
}

describe("the outreach run", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("does not exist until a secret is configured", async () => {
    delete process.env.CRON_SECRET;
    // 404, not 401: an endpoint nobody enabled should not admit to being there.
    expect((await call(SECRET)).status).toBe(404);
  });

  it("turns away a request with no token, and one with the wrong token", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("not-the-secret")).status).toBe(401);
  });

  it("turns away a token of the right length but the wrong bytes", async () => {
    // The comparison is constant-time; this is the case a length check alone
    // would let through.
    const wrong = "a".repeat(SECRET.length);
    expect(wrong).toHaveLength(SECRET.length);
    expect((await call(wrong)).status).toBe(401);
  });

  it("says it did nothing, rather than nothing, when outreach is off", async () => {
    await db.studioSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: { outreachEnabled: false },
    });

    const response = await call(SECRET);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      skipped: "Outreach is switched off",
      sent: 0,
    });
  });

  it("names what is missing when outreach is on but not set up", async () => {
    await db.studioSettings.upsert({
      where: { id: "default" },
      create: { id: "default", outreachEnabled: true },
      update: { outreachEnabled: true },
    });

    const response = await call(SECRET);
    const body = await response.json();

    // "Nothing sent" and "nothing could have been sent" are different answers,
    // and the operator reading a cron log deserves the second one.
    expect(body.skipped).toBeTruthy();
    expect(body.sent).toBe(0);
  });
});
