import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "../app/api/cron/daily/route";
import { db, resetDb } from "./setup/db";

const SECRET = "a-scheduling-secret";

function call(token?: string, body: object = {}) {
  return POST(
    new Request("http://localhost/api/cron/daily", {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }) as never,
  );
}

describe("the scheduled run", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.CRON_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("does not exist until a secret is configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await call(SECRET);

    // 404, not 401: an endpoint nobody enabled should not admit to being there.
    expect(response.status).toBe(404);
  });

  it("turns away a request with no token", async () => {
    expect((await call()).status).toBe(401);
  });

  it("turns away a request with the wrong token", async () => {
    expect((await call("not-the-secret")).status).toBe(401);
    // Same length, different bytes — the comparison is not a prefix match.
    expect((await call("a-scheduling-secreT")).status).toBe(401);
  });

  it("runs, and reports what it did", async () => {
    await db.studioSettings.create({
      data: { id: "default", digestChatEnabled: true },
    });

    const response = await call(SECRET);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.digest.skipped).toBeUndefined();
    expect(body.digest).toMatchObject({ ok: true, signals: 0 });
    // The sweep runs on the same call and reports separately.
    expect(body.retention).toMatchObject({ loginAttempts: 0, authTokens: 0 });
  });

  it("throws away what has aged out even when the digest is switched off", async () => {
    await db.studioSettings.create({ data: { id: "default" } });
    await db.webhookDelivery.create({
      data: {
        id: "ancient",
        receivedAt: new Date(Date.now() - 30 * 86_400_000),
      },
    });

    const body = await (await call(SECRET)).json();

    // Retention must not depend on somebody having enabled a mailing.
    expect(body.digest.skipped).toBe("The daily digest is switched off");
    expect(body.retention.webhookDeliveries).toBe(1);
    expect(await db.webhookDelivery.count()).toBe(0);
  });

  it("says it already ran rather than sending twice", async () => {
    await db.studioSettings.create({
      data: {
        id: "default",
        digestChatEnabled: true,
        digestLastRunAt: new Date(),
      },
    });

    const skipped = await (await call(SECRET)).json();
    expect(skipped.digest.skipped).toBe("Already ran within the last 12 hours");

    const forced = await (await call(SECRET, { force: true })).json();
    expect(forced.digest.skipped).toBeUndefined();
  });
});
