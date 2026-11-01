import { beforeEach, describe, expect, it } from "vitest";

import { readUnsubscribeToken, unsubscribeToken } from "../lib/outreach-tokens";
import { emailKey } from "../lib/leads";
import { POST } from "../app/api/outreach/unsubscribe/route";
import { db, resetDb } from "./setup/db";

const SECRET = "a-secret-for-the-unsubscribe-links";

async function makeLead(email = "ada@example.com") {
  return db.lead.create({
    data: {
      email,
      emailKey: emailKey(email),
      sourceKind: "CSV_IMPORT",
      sourceDetail: "Attendee list, WebSummit Oct 2026",
    },
  });
}

function oneClick(token: string) {
  return new Request(
    `http://localhost/api/outreach/unsubscribe?t=${encodeURIComponent(token)}`,
    { method: "POST" },
  );
}

function formPost(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request("http://localhost/api/outreach/unsubscribe", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

describe("the token", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
  });

  it("goes there and back", () => {
    const token = unsubscribeToken("lead-123");
    expect(readUnsubscribeToken(token)).toBe("lead-123");
  });

  it("is the same link every time, because nothing is stored", () => {
    expect(unsubscribeToken("lead-123")).toBe(unsubscribeToken("lead-123"));
  });

  it("refuses a tampered signature, a swapped id, and rubbish", () => {
    const token = unsubscribeToken("lead-123");
    const [id, signature] = token.split(".");

    expect(readUnsubscribeToken(`${id}.${signature!.slice(0, -1)}x`)).toBeNull();
    expect(readUnsubscribeToken(`lead-456.${signature}`)).toBeNull();
    expect(readUnsubscribeToken("lead-123")).toBeNull();
    expect(readUnsubscribeToken("")).toBeNull();
    expect(readUnsubscribeToken(".abc")).toBeNull();
  });

  it("stops verifying when the server key is rotated", () => {
    const token = unsubscribeToken("lead-123");
    process.env.AUTH_SECRET = "a-different-secret-entirely";
    // Which is exactly why the by-address form exists.
    expect(readUnsubscribeToken(token)).toBeNull();
  });
});

describe("one-click unsubscribe", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.AUTH_SECRET = SECRET;
  });

  it("suppresses the address and answers 200", async () => {
    const lead = await makeLead();

    const response = await POST(oneClick(unsubscribeToken(lead.id)));
    expect(response.status).toBe(200);

    const row = await db.suppression.findUnique({
      where: { emailKey: "ada@example.com" },
    });
    expect(row?.reason).toBe("UNSUBSCRIBE");
    expect(row?.source).toBe("one-click unsubscribe");
  });

  it("records it in the lead's diary as their own act", async () => {
    const lead = await makeLead();
    await POST(oneClick(unsubscribeToken(lead.id)));

    const entries = await db.timelineEntry.findMany({
      where: { leadId: lead.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("UNSUBSCRIBE");
    // Not HUMAN: nobody in the studio did this.
    expect(entries[0]!.actorKind).toBe("CONTACT");
  });

  it("answers 200 the second time too", async () => {
    const lead = await makeLead();
    const token = unsubscribeToken(lead.id);

    expect((await POST(oneClick(token))).status).toBe(200);
    // A mail client that retries, or a person pressing the link again next
    // month, must not be shown an error for succeeding twice.
    expect((await POST(oneClick(token))).status).toBe(200);
    expect(await db.suppression.count()).toBe(1);
  });

  it("still answers 200 for a lead that has since been deleted", async () => {
    const lead = await makeLead();
    const token = unsubscribeToken(lead.id);
    await db.lead.delete({ where: { id: lead.id } });

    // There is nothing left to mail, which is what was asked for.
    expect((await POST(oneClick(token))).status).toBe(200);
  });

  it("refuses a token that does not verify, and says where to go", async () => {
    const response = await POST(oneClick("lead-123.notasignatureatall"));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("enter your address");
    expect(await db.suppression.count()).toBe(0);
  });
});

describe("the by-address form", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.AUTH_SECRET = SECRET;
  });

  it("suppresses by address and redirects a browser", async () => {
    await makeLead();

    const response = await POST(formPost({ email: "Ada@Example.com" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/unsubscribe/done");

    expect(
      await db.suppression.findUnique({
        where: { emailKey: "ada@example.com" },
      }),
    ).not.toBeNull();
  });

  it("works for an address the studio has never heard of", async () => {
    const response = await POST(formPost({ email: "stranger@example.com" }));
    expect(response.status).toBe(303);
    expect(await db.suppression.count()).toBe(1);
  });

  it("sends a bad address back to the form rather than a blank error", async () => {
    const response = await POST(formPost({ email: "not-an-address" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("problem=1");
    expect(await db.suppression.count()).toBe(0);
  });

  it("takes the token from the form body as well as the query", async () => {
    const lead = await makeLead();
    const response = await POST(
      formPost({ token: unsubscribeToken(lead.id) }),
    );

    expect(response.status).toBe(303);
    expect(await db.suppression.count()).toBe(1);
  });
});

describe("what the route does not offer", () => {
  it("has no GET at all", async () => {
    // Corporate mail gateways prefetch every URL in a message. A GET that
    // unsubscribed would take people off the list who never touched the link.
    const route = await import("../app/api/outreach/unsubscribe/route");
    expect(Object.keys(route)).not.toContain("GET");
  });
});
