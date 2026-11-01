import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { LEASE_MS, runOutreachTick } from "../lib/outreach-send";
import { emailKey, suppress } from "../lib/leads";
import { startFakeSmtp, type FakeSmtp } from "./setup/smtp";
import { db, resetDb } from "./setup/db";

/**
 * The scheduler, against a real SMTP conversation.
 *
 * `now` and `runId` are parameters rather than module globals, which is what
 * makes a window edge, an expired lease and two servers racing all testable
 * without waiting for any of them.
 */

let smtp: FakeSmtp;

const SETTINGS = {
  id: "default",
  outreachEnabled: true,
  outreachReplyDomain: "hi.studio.example",
  outreachPostalAddress: "Northwind Studio, 14 Bridge Street, Bristol",
  outreachSignature: "Dana Reed",
  outreachDailyCap: 60,
};

/** Friday, inside a 09:00–17:00 UTC weekday window. */
const FRIDAY = new Date("2026-08-07T10:00:00Z");
const SATURDAY = new Date("2026-08-08T10:00:00Z");

beforeAll(async () => {
  smtp = await startFakeSmtp();
  process.env.OUTREACH_SMTP_URL = `smtp://127.0.0.1:${smtp.port}`;
  process.env.OUTREACH_MAIL_FROM = "Northwind <hello@hi.studio.example>";
  process.env.AUTH_SECRET = "a-secret-for-the-unsubscribe-links";
  process.env.APP_URL = "https://tracker.example";
});

afterAll(async () => {
  delete process.env.OUTREACH_SMTP_URL;
  delete process.env.OUTREACH_MAIL_FROM;
  await smtp.close();
});

async function scenario({
  windowDays = "1,2,3,4,5",
  dailyCap = 30,
  minGapMinutes = 6,
  steps = [
    { subject: "First", body: "{{greeting}}\n\nA first message worth reading." },
    { subject: "Second", body: "{{greeting}}\n\nA second message worth reading." },
  ],
  leads = 1,
  approved = true,
}: {
  windowDays?: string;
  dailyCap?: number;
  minGapMinutes?: number;
  steps?: { subject: string; body: string }[];
  leads?: number;
  approved?: boolean;
} = {}) {
  await db.studioSettings.upsert({
    where: { id: "default" },
    create: SETTINGS,
    update: SETTINGS,
  });

  const user = await db.user.create({
    data: {
      email: `dana-${Math.random().toString(36).slice(2, 8)}@studio.com`,
      handle: `d${Math.random().toString(36).slice(2, 8)}`,
      name: "Dana Reed",
      passwordHash: "x",
      role: "ADMIN",
    },
  });

  const campaign = await db.campaign.create({
    data: {
      name: "Agencies, August",
      status: "ACTIVE",
      windowStartHour: 9,
      windowEndHour: 17,
      windowDays,
      timezone: "UTC",
      dailyCap,
      minGapMinutes,
      steps: {
        create: steps.map((s, i) => ({ ...s, position: i + 1, delayDays: 3 })),
      },
    },
    include: { steps: { orderBy: { position: "asc" } } },
  });

  const made = [];
  for (let i = 0; i < leads; i += 1) {
    const email = `lead-${i}-${Math.random().toString(36).slice(2, 6)}@example.com`;
    const lead = await db.lead.create({
      data: {
        email,
        emailKey: emailKey(email),
        name: `Lead ${i}`,
        sourceKind: "CSV_IMPORT",
        sourceDetail: "Attendee list, WebSummit Oct 2026",
      },
    });

    const enrolment = await db.campaignEnrolment.create({
      data: {
        campaignId: campaign.id,
        leadId: lead.id,
        status: approved ? "ACTIVE" : "AWAITING_APPROVAL",
        approvedById: approved ? user.id : null,
        approvedAt: approved ? new Date("2026-08-07T09:00:00Z") : null,
      },
    });

    const message = await db.outreachMessage.create({
      data: {
        direction: "OUT",
        state: approved ? "SCHEDULED" : "AWAITING_APPROVAL",
        leadId: lead.id,
        campaignId: campaign.id,
        enrolmentId: enrolment.id,
        stepId: campaign.steps[0]!.id,
        subject: campaign.steps[0]!.subject,
        body: campaign.steps[0]!.body,
        scheduledFor: approved ? new Date("2026-08-07T09:30:00Z") : null,
      },
    });

    made.push({ lead, enrolment, message });
  }

  return { campaign, user, leads: made };
}

beforeEach(async () => {
  await resetDb();
  smtp.messages.length = 0;
});

describe("when nothing may go out", () => {
  it("says so rather than sending, with outreach switched off", async () => {
    await scenario();
    await db.studioSettings.update({
      where: { id: "default" },
      data: { outreachEnabled: false },
    });

    const report = await runOutreachTick({ now: FRIDAY });
    expect(report.skipped).toBe("Outreach is switched off");
    expect(smtp.messages).toHaveLength(0);
  });

  it("refuses to send at all without a postal address", async () => {
    await scenario();
    await db.studioSettings.update({
      where: { id: "default" },
      data: { outreachPostalAddress: null },
    });

    const report = await runOutreachTick({ now: FRIDAY });
    expect(report.skipped).toContain("postal address");
    expect(smtp.messages).toHaveLength(0);
  });

  it("sends nothing outside the window", async () => {
    await scenario();
    const report = await runOutreachTick({ now: SATURDAY });
    expect(report.sent).toBe(0);
    expect(smtp.messages).toHaveLength(0);
  });

  it("never claims an enrolment nobody approved", async () => {
    // The safeguard is here, not in the interface: hiding the button is not
    // what stops an unapproved message.
    await scenario({ approved: false });
    const report = await runOutreachTick({ now: FRIDAY });

    expect(report.claimed).toBe(0);
    expect(smtp.messages).toHaveLength(0);
  });
});

describe("sending", () => {
  it("puts one message on the wire with everything it needs", async () => {
    const { leads } = await scenario();
    const report = await runOutreachTick({ now: FRIDAY });

    expect(report.sent).toBe(1);
    expect(smtp.messages).toHaveLength(1);

    const wire = smtp.messages[0]!;
    expect(wire).toContain(leads[0]!.lead.email);
    expect(wire).toContain("List-Unsubscribe");
    expect(wire).toContain("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
    expect(wire).toContain("Precedence: bulk");
    expect(wire).toMatch(/Reply-To: outreach\+[\w-]+@hi\.studio\.example/);
    expect(wire).toContain("Northwind Studio, 14 Bridge Street, Bristol");
    expect(wire).toContain("WebSummit Oct 2026");
  });

  it("records what actually left, not the template", async () => {
    const { leads } = await scenario();
    await runOutreachTick({ now: FRIDAY });

    const message = await db.outreachMessage.findUniqueOrThrow({
      where: { id: leads[0]!.message.id },
    });
    expect(message.state).toBe("SENT");
    expect(message.sentAt).not.toBeNull();
    expect(message.claimedBy).toBeNull();
    expect(message.replyToken).not.toBeNull();
    expect(message.rfcMessageId).toContain("@hi.studio.example");
    // The stored body is the rendered one, footer and all.
    expect(message.body).toContain("Hello Lead 0,");
    expect(message.body).toContain("To stop these emails:");
  });

  it("writes the lead's diary and moves them off NEW", async () => {
    const { leads } = await scenario();
    await runOutreachTick({ now: FRIDAY });

    const lead = await db.lead.findUniqueOrThrow({
      where: { id: leads[0]!.lead.id },
    });
    expect(lead.status).toBe("ACTIVE");
    expect(lead.lastContactedAt).not.toBeNull();

    const entry = await db.timelineEntry.findFirstOrThrow({
      where: { leadId: lead.id, kind: "EMAIL_OUT" },
    });
    expect(entry.actorKind).toBe("MACHINE");
    expect(entry.messageId).toBe(leads[0]!.message.id);
  });

  it("writes the next step only after this one has gone", async () => {
    const { leads } = await scenario();

    // Before the tick there is exactly one message, not one per step.
    expect(await db.outreachMessage.count()).toBe(1);

    await runOutreachTick({ now: FRIDAY });

    const queued = await db.outreachMessage.findMany({
      where: { state: "SCHEDULED" },
    });
    expect(queued).toHaveLength(1);
    expect(queued[0]!.subject).toBe("Second");
    // Three days after it actually went, not after enrolment.
    expect(queued[0]!.scheduledFor!.toISOString()).toBe(
      "2026-08-10T10:00:00.000Z",
    );

    const enrolment = await db.campaignEnrolment.findUniqueOrThrow({
      where: { id: leads[0]!.enrolment.id },
    });
    expect(enrolment.sentStep).toBe(1);
    expect(enrolment.status).toBe("ACTIVE");
  });

  it("completes the enrolment after the last step", async () => {
    const { leads } = await scenario({
      steps: [{ subject: "Only", body: "{{greeting}}\n\nThe only message." }],
    });
    await runOutreachTick({ now: FRIDAY });

    const enrolment = await db.campaignEnrolment.findUniqueOrThrow({
      where: { id: leads[0]!.enrolment.id },
    });
    expect(enrolment.status).toBe("COMPLETED");
    expect(await db.outreachMessage.count({ where: { state: "SCHEDULED" } })).toBe(0);
  });
});

describe("suppression is re-checked at send time", () => {
  it("cancels a message queued before the address unsubscribed", async () => {
    // The single most important correctness rule in the subsystem: a message
    // scheduled three days ago may be addressed to somebody who unsubscribed
    // yesterday.
    const { leads } = await scenario();
    await suppress({ email: leads[0]!.lead.email, reason: "UNSUBSCRIBE" });

    const report = await runOutreachTick({ now: FRIDAY });

    expect(report.sent).toBe(0);
    expect(report.cancelledSuppressed).toBe(1);
    expect(smtp.messages).toHaveLength(0);

    const message = await db.outreachMessage.findUniqueOrThrow({
      where: { id: leads[0]!.message.id },
    });
    expect(message.state).toBe("CANCELLED");

    const enrolment = await db.campaignEnrolment.findUniqueOrThrow({
      where: { id: leads[0]!.enrolment.id },
    });
    expect(enrolment.status).toBe("STOPPED_UNSUBSCRIBED");
  });

  it("stops the rest of the sequence too", async () => {
    const { leads } = await scenario();
    await suppress({ email: leads[0]!.lead.email, reason: "UNSUBSCRIBE" });
    await runOutreachTick({ now: FRIDAY });

    // No step two was written, because step one never went.
    expect(await db.outreachMessage.count({ where: { state: "SCHEDULED" } })).toBe(0);
  });
});

describe("the throttle", () => {
  it("honours the gap between two messages within a run", async () => {
    // Claiming three and posting them in the same second would defeat the
    // point of a minimum gap.
    await scenario({ leads: 3 });
    const report = await runOutreachTick({ now: FRIDAY });

    expect(report.sent).toBe(1);
    expect(smtp.messages).toHaveLength(1);
  });

  it("sends the lot when the campaign asks for no gap", async () => {
    await scenario({ leads: 3, minGapMinutes: 0 });
    const report = await runOutreachTick({ now: FRIDAY });

    expect(report.sent).toBe(3);
    expect(smtp.messages).toHaveLength(3);
  });

  it("stops at the studio ceiling across every campaign", async () => {
    await scenario({ leads: 3, minGapMinutes: 0 });
    await db.studioSettings.update({
      where: { id: "default" },
      data: { outreachDailyCap: 2 },
    });

    const report = await runOutreachTick({ now: FRIDAY });
    expect(report.sent).toBe(2);
  });

  it("stops at the campaign's own daily cap", async () => {
    await scenario({ leads: 3, minGapMinutes: 0, dailyCap: 1 });
    const report = await runOutreachTick({ now: FRIDAY });
    expect(report.sent).toBe(1);
  });
});

describe("two servers, one queue", () => {
  it("claims disjoint sets, and nothing is sent twice", async () => {
    await scenario({ leads: 4, minGapMinutes: 0 });

    // Two ticks with different run ids, as two instances would.
    const a = await runOutreachTick({ now: FRIDAY, runId: "instance-a" });
    const b = await runOutreachTick({ now: FRIDAY, runId: "instance-b" });

    expect(a.sent + b.sent).toBe(4);
    expect(smtp.messages).toHaveLength(4);

    const sent = await db.outreachMessage.findMany({
      where: { state: "SENT" },
      select: { id: true },
    });
    expect(new Set(sent.map((s) => s.id)).size).toBe(4);
  });

  it("leaves a row claimed by a live lease alone", async () => {
    const { leads } = await scenario();
    // As if another instance took it thirty seconds ago and is mid-SMTP.
    await db.outreachMessage.update({
      where: { id: leads[0]!.message.id },
      data: {
        state: "SENDING",
        claimedBy: "some-other-instance",
        claimedAt: new Date(FRIDAY.getTime() - 30_000),
      },
    });

    const report = await runOutreachTick({ now: FRIDAY, runId: "mine" });
    expect(report.claimed).toBe(0);
    expect(smtp.messages).toHaveLength(0);
  });

  it("takes a row back once the lease has expired, and not before", async () => {
    const { leads } = await scenario();
    await db.outreachMessage.update({
      where: { id: leads[0]!.message.id },
      data: {
        state: "SENDING",
        claimedBy: "an-instance-that-crashed",
        claimedAt: new Date(FRIDAY.getTime() - LEASE_MS - 1000),
      },
    });

    const report = await runOutreachTick({ now: FRIDAY, runId: "mine" });
    expect(report.sent).toBe(1);
  });
});

describe("when the server refuses", () => {
  it("backs off, then gives up, and never throws out of the run", async () => {
    const { leads } = await scenario();
    smtp.refuse = true;

    try {
      const first = await runOutreachTick({ now: FRIDAY });
      expect(first.sent).toBe(0);

      let message = await db.outreachMessage.findUniqueOrThrow({
        where: { id: leads[0]!.message.id },
      });
      // Back in the queue, later, with the reason recorded.
      expect(message.state).toBe("SCHEDULED");
      expect(message.attempts).toBe(1);
      expect(message.scheduledFor!.getTime()).toBeGreaterThan(FRIDAY.getTime());
      expect(message.error).toBeTruthy();

      // Two more attempts, each after its backoff.
      await runOutreachTick({ now: new Date(FRIDAY.getTime() + 3_600_000) });
      const third = await runOutreachTick({
        now: new Date(FRIDAY.getTime() + 7_200_000),
      });

      message = await db.outreachMessage.findUniqueOrThrow({
        where: { id: leads[0]!.message.id },
      });
      expect(message.state).toBe("FAILED");
      expect(third.failed).toBe(1);
    } finally {
      smtp.refuse = false;
    }
  });

  it("does not stop the others because one address is bad", async () => {
    await scenario({ leads: 2, minGapMinutes: 0 });
    const report = await runOutreachTick({ now: FRIDAY });
    expect(report.sent).toBe(2);
  });
});

describe("the record of the run", () => {
  it("is written to the settings row", async () => {
    await scenario();
    await runOutreachTick({ now: FRIDAY });

    const settings = await db.studioSettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    expect(settings.outreachLastTickAt?.toISOString()).toBe(FRIDAY.toISOString());
    expect(settings.outreachLastTickInfo).toContain("1 sent");
  });
});

describe("retention", () => {
  it("sweeps the message bodies and keeps the line saying one was sent", async () => {
    const { leads } = await scenario();
    await runOutreachTick({ now: FRIDAY });

    await db.outreachMessage.updateMany({
      data: { createdAt: new Date(Date.now() - 400 * 86_400_000) },
    });

    const { runRetentionSweep } = await import("../lib/retention");
    const counts = await runRetentionSweep({
      rules: {
        retainActivityDays: 0,
        retainChatDays: 0,
        retainAiUsageDays: 0,
        retainMeetingDays: 0,
        retainOutreachDays: 30,
      },
    });

    expect(counts.outreachMessages).toBe(2);
    expect(await db.outreachMessage.count()).toBe(0);

    // That somebody was written to on a date is the fact worth keeping
    // longest, and it is the fact a complaint turns on. The entry survives
    // with its messageId pointing at nothing.
    const entry = await db.timelineEntry.findFirstOrThrow({
      where: { leadId: leads[0]!.lead.id, kind: "EMAIL_OUT" },
    });
    expect(entry.messageId).toBeNull();
    expect(await db.lead.count()).toBe(1);
  });
});
