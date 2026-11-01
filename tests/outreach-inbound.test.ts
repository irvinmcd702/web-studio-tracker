import { createHmac } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";

import { POST } from "../app/api/outreach/inbound/route";
import { emailKey } from "../lib/leads";
import {
  MAX_BODY_CHARS,
  deliveryId,
  detectProvider,
  normalise,
  readMessageIds,
  readReplyToken,
  verifyMailgun,
  verifyPostmark,
  verifySvix,
} from "../lib/outreach-inbound";
import { db, resetDb } from "./setup/db";

const SECRET = "an-inbound-secret-long-enough-to-be-worth-having";
const DOMAIN = "hi.studio.example";

// ---------------------------------------------------------------------------
// Payload builders, one per provider.
// ---------------------------------------------------------------------------

function mailgunBody({
  event = "stored",
  severity = null as string | null,
  from = "ada@example.com",
  to = `outreach+tok123@${DOMAIN}`,
  body = "Yes, worth a chat. Tuesday?",
  timestamp = Math.floor(Date.now() / 1000),
  references = null as string | null,
  inReplyTo = null as string | null,
} = {}) {
  const token = "mg-token";
  const signature = createHmac("sha256", SECRET)
    .update(`${timestamp}${token}`)
    .digest("hex");

  return {
    signature: { timestamp: String(timestamp), token, signature },
    "event-data": {
      id: `mg-${Math.random().toString(36).slice(2)}`,
      event,
      severity,
      recipient: to,
      "body-plain": body,
      message: {
        headers: {
          from,
          to,
          subject: "Re: A quick question",
          "message-id": "<theirs@example.com>",
          "in-reply-to": inReplyTo,
          references,
        },
      },
    },
  };
}

function postmarkBody({
  record = "Inbound",
  type = null as string | null,
  from = "ada@example.com",
  to = `outreach+tok123@${DOMAIN}`,
  body = "Yes, worth a chat. Tuesday?",
} = {}) {
  return {
    RecordType: record,
    Type: type,
    From: from,
    To: to,
    Email: from,
    Subject: "Re: A quick question",
    TextBody: body,
    MessageID: `pm-${Math.random().toString(36).slice(2)}`,
    Headers: [{ Name: "Message-ID", Value: "<theirs@example.com>" }],
  };
}

function post(
  payload: unknown,
  {
    headers = {} as Record<string, string>,
    query = "",
  }: { headers?: Record<string, string>; query?: string } = {},
) {
  return POST(
    new Request(`http://localhost/api/outreach/inbound${query}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    }) as never,
  );
}

function svixHeaders(raw: string, secret = SECRET, at = Date.now()) {
  const id = "msg_123";
  const timestamp = String(Math.floor(at / 1000));
  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret);
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");

  return {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${signature}`,
  };
}

async function setUp({ enabled = true, secret = SECRET as string | null } = {}) {
  await db.studioSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      outreachEnabled: enabled,
      outreachInboundSecret: secret,
      outreachReplyDomain: DOMAIN,
      outreachPostalAddress: "Northwind Studio, Bristol",
    },
    update: { outreachEnabled: enabled, outreachInboundSecret: secret },
  });
}

async function makeSentMessage({
  email = "ada@example.com",
  replyToken = "tok123",
  rfcMessageId = "<ours-1@hi.studio.example>",
  enrol = true,
} = {}) {
  const lead = await db.lead.create({
    data: {
      email,
      emailKey: emailKey(email),
      name: "Ada Lovelace",
      status: "ACTIVE",
      sourceKind: "CSV_IMPORT",
      sourceDetail: "Attendee list",
    },
  });

  const campaign = await db.campaign.create({
    data: {
      name: "Agencies",
      status: "ACTIVE",
      steps: {
        create: [
          { position: 1, subject: "First", body: "{{greeting}}\n\nHello there." },
          { position: 2, subject: "Second", body: "{{greeting}}\n\nAgain." },
        ],
      },
    },
  });

  const enrolment = enrol
    ? await db.campaignEnrolment.create({
        data: {
          campaignId: campaign.id,
          leadId: lead.id,
          status: "ACTIVE",
          approvedAt: new Date(),
          sentStep: 1,
        },
      })
    : null;

  const sent = await db.outreachMessage.create({
    data: {
      direction: "OUT",
      state: "SENT",
      leadId: lead.id,
      campaignId: campaign.id,
      enrolmentId: enrolment?.id ?? null,
      subject: "A quick question",
      body: "Hello Ada,\n\nHello there.",
      replyToken,
      rfcMessageId,
      sentAt: new Date(),
    },
  });

  // The next touch, queued and waiting.
  const queued = await db.outreachMessage.create({
    data: {
      direction: "OUT",
      state: "SCHEDULED",
      leadId: lead.id,
      campaignId: campaign.id,
      enrolmentId: enrolment?.id ?? null,
      subject: "Second",
      body: "{{greeting}}\n\nAgain.",
      scheduledFor: new Date(Date.now() + 3 * 86_400_000),
    },
  });

  return { lead, campaign, enrolment, sent, queued };
}

// ---------------------------------------------------------------------------

describe("working out who sent it", () => {
  it("recognises each provider", () => {
    const headers = (h: Record<string, string>) => ({
      get: (n: string) => h[n.toLowerCase()] ?? null,
    });

    expect(detectProvider(headers({ "svix-id": "x" }), {})).toBe("svix");
    expect(detectProvider(headers({}), mailgunBody())).toBe("mailgun");
    expect(detectProvider(headers({}), postmarkBody())).toBe("postmark");
    expect(detectProvider(headers({}), { hello: "world" })).toBeNull();
  });
});

describe("signatures", () => {
  it("accepts a real Mailgun signature and refuses a tampered one", () => {
    const body = mailgunBody();
    expect(verifyMailgun(body, SECRET)).toBe(true);
    expect(verifyMailgun(body, "the-wrong-secret")).toBe(false);

    const tampered = structuredClone(body);
    tampered.signature.signature = tampered.signature.signature.replace(
      /.$/,
      "0",
    );
    expect(verifyMailgun(tampered, SECRET)).toBe(false);
  });

  it("refuses a Mailgun signature from outside the time window", () => {
    // A captured signature stays valid forever otherwise.
    const old = Math.floor((Date.now() - 30 * 60_000) / 1000);
    expect(verifyMailgun(mailgunBody({ timestamp: old }), SECRET)).toBe(false);
  });

  it("checks the Postmark shared secret in constant time", () => {
    expect(verifyPostmark(SECRET, SECRET)).toBe(true);
    expect(verifyPostmark(null, SECRET)).toBe(false);
    expect(verifyPostmark("x".repeat(SECRET.length), SECRET)).toBe(false);
  });

  it("accepts a Svix signature, including a rotating multi-signature header", () => {
    const raw = JSON.stringify({ type: "email.bounced", data: {} });
    const headers = svixHeaders(raw);
    const get = (h: Record<string, string>) => ({
      get: (n: string) => h[n.toLowerCase()] ?? null,
    });

    expect(verifySvix(raw, get(headers), SECRET)).toBe(true);

    // Two signatures during a key rotation; one matching is enough.
    const rotating = {
      ...headers,
      "svix-signature": `v1,anoldoneentirely ${headers["svix-signature"]}`,
    };
    expect(verifySvix(raw, get(rotating), SECRET)).toBe(true);

    expect(verifySvix(raw + " ", get(headers), SECRET)).toBe(false);
    expect(verifySvix(raw, get(headers), "another-secret")).toBe(false);
  });
});

describe("reading a payload", () => {
  it("finds the reply token in whichever recipient carries it", () => {
    expect(readReplyToken([`outreach+abc123@${DOMAIN}`])).toBe("abc123");
    expect(
      readReplyToken(["someone@else.com", `outreach+xyz@${DOMAIN}`]),
    ).toBe("xyz");
    expect(readReplyToken([`plain@${DOMAIN}`])).toBeNull();
    expect(readReplyToken([])).toBeNull();
  });

  it("pulls message ids out of both threading headers", () => {
    expect(
      readMessageIds("<a@x>", "<b@y> <c@z>\n <b@y>"),
    ).toEqual(["<a@x>", "<b@y>", "<c@z>"]);
  });

  it("separates a permanent Mailgun failure from a temporary one", () => {
    expect(
      normalise("mailgun", mailgunBody({ event: "failed", severity: "permanent" }))!
        .kind,
    ).toBe("hard_bounce");
    expect(
      normalise("mailgun", mailgunBody({ event: "failed", severity: "temporary" }))!
        .kind,
    ).toBe("soft_bounce");
    expect(normalise("mailgun", mailgunBody({ event: "complained" }))!.kind).toBe(
      "complaint",
    );
  });

  it("reads Postmark's own bounce vocabulary", () => {
    expect(
      normalise("postmark", postmarkBody({ record: "Bounce", type: "HardBounce" }))!
        .kind,
    ).toBe("hard_bounce");
    expect(
      normalise("postmark", postmarkBody({ record: "Bounce", type: "Transient" }))!
        .kind,
    ).toBe("soft_bounce");
    expect(
      normalise("postmark", postmarkBody({ record: "SpamComplaint" }))!.kind,
    ).toBe("complaint");
    expect(normalise("postmark", postmarkBody({}))!.kind).toBe("reply");
  });

  it("namespaces the delivery id so it cannot collide with a git one", () => {
    const event = normalise("mailgun", mailgunBody())!;
    expect(deliveryId(event, "{}")).toMatch(/^outreach:/);
    // No id from the provider still stops a verbatim replay.
    expect(deliveryId(null, "{}")).toMatch(/^outreach:[0-9a-f]{64}$/);
  });
});

describe("the route refuses what it should", () => {
  beforeEach(resetDb);

  it("does not exist while outreach is off", async () => {
    await setUp({ enabled: false });
    expect((await post(mailgunBody())).status).toBe(404);
  });

  it("does not exist until a secret is set", async () => {
    await setUp({ secret: null });
    expect((await post(mailgunBody())).status).toBe(404);
  });

  it("turns away a payload that does not verify", async () => {
    await setUp();
    const bad = mailgunBody();
    bad.signature.signature = "0".repeat(64);
    expect((await post(bad)).status).toBe(401);
  });

  it("turns away a payload from nobody it recognises", async () => {
    await setUp();
    expect((await post({ hello: "world" })).status).toBe(400);
  });

  it("turns away a body larger than it will read", async () => {
    await setUp();
    const huge = { padding: "x".repeat(600 * 1024) };
    expect((await post(huge)).status).toBe(413);
  });
});

describe("a reply", () => {
  beforeEach(async () => {
    await resetDb();
    await setUp();
  });

  it("is threaded by the reply token, stored, and stops the sequence", async () => {
    const { lead, queued, enrolment } = await makeSentMessage();

    const response = await post(mailgunBody());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      handled: true,
      kind: "reply",
    });

    const inbound = await db.outreachMessage.findFirstOrThrow({
      where: { direction: "IN" },
    });
    expect(inbound.leadId).toBe(lead.id);
    expect(inbound.body).toContain("worth a chat");

    // Every reply stops the sequence: they answered, so the machine stops.
    expect(
      (await db.campaignEnrolment.findUniqueOrThrow({ where: { id: enrolment!.id } }))
        .status,
    ).toBe("STOPPED_REPLIED");
    expect(
      (await db.outreachMessage.findUniqueOrThrow({ where: { id: queued.id } }))
        .state,
    ).toBe("CANCELLED");

    const after = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after.status).toBe("REPLIED");
    expect(after.replyCount).toBe(1);
  });

  it("writes it into the diary as the other side speaking", async () => {
    const { lead } = await makeSentMessage();
    await post(mailgunBody());

    const entry = await db.timelineEntry.findFirstOrThrow({
      where: { leadId: lead.id, kind: "EMAIL_IN" },
    });
    expect(entry.actorKind).toBe("CONTACT");
  });

  it("threads by References when the token is gone", async () => {
    const { lead } = await makeSentMessage();

    await post(
      mailgunBody({
        to: `plain@${DOMAIN}`,
        references: "<ours-1@hi.studio.example>",
      }),
    );

    const inbound = await db.outreachMessage.findFirstOrThrow({
      where: { direction: "IN" },
    });
    expect(inbound.leadId).toBe(lead.id);
  });

  it("threads by the From address as a last resort, and says it was a guess", async () => {
    const { lead } = await makeSentMessage();

    await post(mailgunBody({ to: `plain@${DOMAIN}` }));

    const entry = await db.timelineEntry.findFirstOrThrow({
      where: { leadId: lead.id, kind: "EMAIL_IN" },
    });
    // A reader deserves to know which of their records is a guess.
    expect(entry.body).toContain("could be the wrong campaign");
  });

  it("stores an unplaceable reply without inventing a lead", async () => {
    const response = await post(
      mailgunBody({ from: "stranger@example.com", to: `plain@${DOMAIN}` }),
    );

    await expect(response.json()).resolves.toMatchObject({
      outcome: "stored, but could not be placed",
    });

    const inbound = await db.outreachMessage.findFirstOrThrow({
      where: { direction: "IN" },
    });
    expect(inbound.leadId).toBeNull();
    expect(inbound.fromEmail).toBe("stranger@example.com");
    // Writing a stranger into the database because they emailed once would be
    // exactly the silent write this feature avoids everywhere else.
    expect(await db.lead.count()).toBe(0);
  });

  it("cuts a quoted thread rather than storing megabytes of history", async () => {
    await makeSentMessage();
    await post(mailgunBody({ body: "x".repeat(MAX_BODY_CHARS + 5_000) }));

    const inbound = await db.outreachMessage.findFirstOrThrow({
      where: { direction: "IN" },
    });
    expect(inbound.body).toHaveLength(MAX_BODY_CHARS);
    expect(inbound.truncated).toBe(true);
  });

  it("is processed once, however many times the provider sends it", async () => {
    await makeSentMessage();
    const body = mailgunBody();

    expect((await post(body)).status).toBe(200);
    const second = await post(body);
    await expect(second.json()).resolves.toMatchObject({
      handled: false,
      reason: "already processed this delivery",
    });

    expect(await db.outreachMessage.count({ where: { direction: "IN" } })).toBe(1);
  });
});

describe("a bounce or a complaint", () => {
  beforeEach(async () => {
    await resetDb();
    await setUp();
  });

  it("suppresses the address on a hard bounce and stops the sequence", async () => {
    const { lead, queued } = await makeSentMessage();

    await post(mailgunBody({ event: "failed", severity: "permanent" }));

    const row = await db.suppression.findUniqueOrThrow({
      where: { emailKey: emailKey(lead.email) },
    });
    expect(row.reason).toBe("HARD_BOUNCE");
    expect(
      (await db.outreachMessage.findUniqueOrThrow({ where: { id: queued.id } }))
        .state,
    ).toBe("CANCELLED");
    expect(
      (await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status,
    ).toBe("BOUNCED");
  });

  it("suppresses on a complaint, because that is somebody saying stop", async () => {
    const { lead } = await makeSentMessage();
    await post(mailgunBody({ event: "complained" }));

    expect(
      (
        await db.suppression.findUniqueOrThrow({
          where: { emailKey: emailKey(lead.email) },
        })
      ).reason,
    ).toBe("COMPLAINT");
  });

  it("counts a soft bounce, and gives up at the third", async () => {
    // "The mailbox was full for an afternoon" stops being plausible at three.
    const { lead } = await makeSentMessage();

    for (let i = 0; i < 2; i += 1) {
      await post(mailgunBody({ event: "failed", severity: "temporary" }));
    }
    expect(await db.suppression.count()).toBe(0);
    expect(
      (await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).bounceCount,
    ).toBe(2);

    await post(mailgunBody({ event: "failed", severity: "temporary" }));

    expect(
      (
        await db.suppression.findUniqueOrThrow({
          where: { emailKey: emailKey(lead.email) },
        })
      ).reason,
    ).toBe("REPEATED_SOFT_BOUNCE");
  });

  it("cancels queued messages in every campaign, not only this one", async () => {
    // Somebody who replied to one campaign has not agreed to hear from another.
    const { lead } = await makeSentMessage();
    const other = await db.campaign.create({
      data: { name: "A second campaign", status: "ACTIVE" },
    });
    const elsewhere = await db.outreachMessage.create({
      data: {
        direction: "OUT",
        state: "SCHEDULED",
        leadId: lead.id,
        campaignId: other.id,
        subject: "Elsewhere",
        body: "Body",
        scheduledFor: new Date(),
      },
    });

    await post(mailgunBody({ event: "complained" }));

    expect(
      (await db.outreachMessage.findUniqueOrThrow({ where: { id: elsewhere.id } }))
        .state,
    ).toBe("CANCELLED");
  });
});

describe("the other two providers reach the same place", () => {
  beforeEach(async () => {
    await resetDb();
    await setUp();
  });

  it("takes a Postmark inbound with the secret in the query", async () => {
    const { lead } = await makeSentMessage();

    const response = await post(postmarkBody(), {
      query: `?secret=${encodeURIComponent(SECRET)}`,
    });
    expect(response.status).toBe(200);

    expect(
      (await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status,
    ).toBe("REPLIED");
  });

  it("refuses a Postmark payload with no secret at all", async () => {
    await makeSentMessage();
    expect((await post(postmarkBody())).status).toBe(401);
  });

  it("takes a signed Svix bounce", async () => {
    const { lead } = await makeSentMessage();
    const payload = {
      type: "email.bounced",
      data: { from: "ada@example.com", to: [`outreach+tok123@${DOMAIN}`] },
    };

    const response = await post(payload, {
      headers: svixHeaders(JSON.stringify(payload)),
    });
    expect(response.status).toBe(200);

    expect(
      await db.suppression.findUnique({
        where: { emailKey: emailKey(lead.email) },
      }),
    ).not.toBeNull();
  });
});

describe("what the studio sees afterwards", () => {
  beforeEach(async () => {
    await resetDb();
    await setUp();
  });

  it("records the last inbound on the settings row", async () => {
    await makeSentMessage();
    await post(mailgunBody());

    const settings = await db.studioSettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    expect(settings.outreachLastInboundAt).not.toBeNull();
    expect(settings.outreachLastInboundInfo).toContain("reply");
  });
});
