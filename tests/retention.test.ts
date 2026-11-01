import { beforeEach, describe, expect, it } from "vitest";

import {
  limitKey,
  loginKeys,
  recordFailure,
  resetKeys,
} from "../lib/rate-limit";
import {
  describeRetention,
  previewRetention,
  runRetentionSweep,
  type RetentionRules,
} from "../lib/retention";
import { db, makeProject, makeUser, makeWorkflow, resetDb } from "./setup/db";

const DAY = 86_400_000;
const KEEP: RetentionRules = {
  retainActivityDays: 0,
  retainChatDays: 0,
  retainAiUsageDays: 0,
  retainMeetingDays: 0,
  retainOutreachDays: 0,
};

const ago = (days: number) => new Date(Date.now() - days * DAY);

describe("the limiter keeps no addresses", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.AUTH_SECRET = "a-secret-for-the-limiter-keys";
  });

  it("writes a hash, never the email or the address", async () => {
    await recordFailure(loginKeys("dana@studio.com", "203.0.113.7"));

    const rows = await db.loginAttempt.findMany();
    const keys = rows.map((r) => r.key).join(" ");

    expect(rows).toHaveLength(2);
    expect(keys).not.toContain("dana@studio.com");
    expect(keys).not.toContain("203.0.113.7");
    expect(keys).toMatch(/email:[0-9a-f]{32}/);
    expect(keys).toMatch(/ip:[0-9a-f]{32}/);
  });

  it("still recognises the same visitor twice", () => {
    const first = loginKeys("Dana@Studio.com", "203.0.113.7");
    const second = loginKeys("dana@studio.com ", "203.0.113.7");

    expect(first).toEqual(second);
  });

  it("keeps different people, addresses and purposes apart", () => {
    expect(limitKey("ip", "203.0.113.7")).not.toBe(
      limitKey("ip", "203.0.113.8"),
    );
    // The sign-in bucket and the password-reset bucket must not share a count.
    expect(loginKeys("dana@studio.com", null)[0]).not.toBe(
      resetKeys("dana@studio.com", null)[0],
    );
  });

  it("does not count an address it could not determine", () => {
    expect(loginKeys("dana@studio.com", "unknown")).toHaveLength(1);
    expect(loginKeys("dana@studio.com", null)).toHaveLength(1);
  });

  it("changes every key when the secret is rotated", () => {
    const before = limitKey("ip", "203.0.113.7");
    process.env.AUTH_SECRET = "a-different-secret-entirely";
    expect(limitKey("ip", "203.0.113.7")).not.toBe(before);
  });
});

describe("the sweep", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("clears a spent counter but not one still holding somebody out", async () => {
    await db.loginAttempt.createMany({
      data: [
        { key: "email:aaa", count: 3, windowStart: ago(3), updatedAt: ago(3) },
        {
          key: "ip:bbb",
          count: 5,
          windowStart: ago(3),
          updatedAt: ago(3),
          lockedUntil: new Date(Date.now() + 600_000),
        },
        { key: "email:ccc", count: 1, windowStart: new Date() },
      ],
    });

    const counts = await runRetentionSweep({ rules: KEEP });

    expect(counts.loginAttempts).toBe(1);
    const left = (await db.loginAttempt.findMany()).map((r) => r.key).sort();
    expect(left).toEqual(["email:ccc", "ip:bbb"]);
  });

  it("removes one-time links long past their expiry, and leaves live ones", async () => {
    const person = await makeUser();
    await db.authToken.createMany({
      data: [
        {
          userId: person.id,
          kind: "RESET",
          tokenHash: "old",
          expiresAt: ago(40),
        },
        {
          userId: person.id,
          kind: "INVITE",
          tokenHash: "recent",
          expiresAt: ago(3),
        },
        {
          userId: person.id,
          kind: "INVITE",
          tokenHash: "live",
          expiresAt: new Date(Date.now() + DAY),
        },
      ],
    });

    const counts = await runRetentionSweep({ rules: KEEP });

    expect(counts.authTokens).toBe(1);
    const left = (await db.authToken.findMany()).map((t) => t.tokenHash).sort();
    expect(left).toEqual(["live", "recent"]);
  });

  it("removes webhook delivery ids past a week", async () => {
    await db.webhookDelivery.createMany({
      data: [
        { id: "old-one", receivedAt: ago(9) },
        { id: "new-one", receivedAt: ago(2) },
      ],
    });

    const counts = await runRetentionSweep({ rules: KEEP });

    expect(counts.webhookDeliveries).toBe(1);
    expect(await db.webhookDelivery.count()).toBe(1);
  });

  it("keeps the studio's history forever while the periods are zero", async () => {
    const workflow = await makeWorkflow();
    const person = await makeUser();
    const project = await makeProject({ workflowId: workflow.id });

    await db.activity.create({
      data: {
        type: "test",
        message: "something",
        projectId: project.id,
        createdAt: ago(900),
      },
    });
    await db.chatMessage.create({
      data: {
        projectId: project.id,
        authorId: person.id,
        body: "hello",
        createdAt: ago(900),
      },
    });
    await db.aiUsage.create({
      data: { kind: "acceptance", model: "m", createdAt: ago(900) },
    });

    const counts = await runRetentionSweep({ rules: KEEP });

    expect(counts).toMatchObject({ activity: 0, chatMessages: 0, aiUsage: 0 });
    expect(await db.activity.count()).toBe(1);
    expect(await db.chatMessage.count()).toBe(1);
    expect(await db.aiUsage.count()).toBe(1);
  });

  it("removes what is older than a period once one is chosen", async () => {
    const workflow = await makeWorkflow();
    const person = await makeUser();
    const project = await makeProject({ workflowId: workflow.id });

    await db.chatMessage.createMany({
      data: [
        {
          projectId: project.id,
          authorId: person.id,
          body: "old",
          createdAt: ago(120),
        },
        {
          projectId: project.id,
          authorId: person.id,
          body: "recent",
          createdAt: ago(10),
        },
      ],
    });

    const counts = await runRetentionSweep({
      rules: { ...KEEP, retainChatDays: 90 },
    });

    expect(counts.chatMessages).toBe(1);
    const left = await db.chatMessage.findMany();
    expect(left).toHaveLength(1);
    expect(left[0]!.body).toBe("recent");
  });

  it("never touches the record of what was done and billed", async () => {
    const workflow = await makeWorkflow();
    const person = await makeUser();
    const project = await makeProject({ workflowId: workflow.id });
    const ticket = await db.ticket.create({
      data: {
        projectId: project.id,
        statusId: workflow.statuses[0]!.id,
        number: 1,
        title: "Ancient",
        createdAt: ago(2000),
      },
    });
    await db.workLog.create({
      data: {
        ticketId: ticket.id,
        userId: person.id,
        hours: 4,
        spentOn: ago(2000),
        createdAt: ago(2000),
      },
    });

    await runRetentionSweep({
      rules: {
        retainActivityDays: 1,
        retainChatDays: 1,
        retainAiUsageDays: 1,
        retainMeetingDays: 1,
        retainOutreachDays: 1,
      },
    });

    expect(await db.ticket.count()).toBe(1);
    expect(await db.workLog.count()).toBe(1);
    expect(await db.project.count()).toBe(1);
  });

  it("drops old transcripts but keeps the work agreed in them", async () => {
    const workflow = await makeWorkflow();
    const project = await makeProject({ workflowId: workflow.id });

    const old = await db.meeting.create({
      data: {
        projectId: project.id,
        title: "Kickoff",
        heldAt: ago(400),
        transcript: "Maria: let's begin.",
      },
    });
    await db.meeting.create({
      data: {
        projectId: project.id,
        title: "Yesterday",
        heldAt: ago(1),
        transcript: "Maria: still going.",
      },
    });

    const ticket = await db.ticket.create({
      data: {
        projectId: project.id,
        number: 1,
        title: "Agreed at the kickoff",
        statusId: workflow.statuses[0]!.id,
        meetingId: old.id,
      },
    });

    await runRetentionSweep({ rules: { ...KEEP, retainMeetingDays: 90 } });

    expect(await db.meeting.count()).toBe(1);
    // The ticket survives with its provenance blanked — work does not
    // evaporate because the recording of agreeing it reached its date.
    const after = await db.ticket.findUnique({ where: { id: ticket.id } });
    expect(after).not.toBeNull();
    expect(after?.meetingId).toBeNull();
  });

  it("dates a transcript by when the meeting happened, not when it was filed", async () => {
    const workflow = await makeWorkflow();
    const project = await makeProject({ workflowId: workflow.id });

    // Filed today, held last year: it is a year-old conversation either way.
    await db.meeting.create({
      data: {
        projectId: project.id,
        title: "Filed late",
        heldAt: ago(400),
        transcript: "Maria: this took a while to upload.",
        createdAt: new Date(),
      },
    });

    await runRetentionSweep({ rules: { ...KEEP, retainMeetingDays: 90 } });

    expect(await db.meeting.count()).toBe(0);
  });

  it("counts without deleting when only asked to look", async () => {
    await db.webhookDelivery.create({
      data: { id: "old-one", receivedAt: ago(9) },
    });

    const preview = await previewRetention({ rules: KEEP });

    expect(preview.webhookDeliveries).toBe(1);
    expect(await db.webhookDelivery.count()).toBe(1);
  });

  it("writes down what it did", async () => {
    await db.studioSettings.create({ data: { id: "default" } });
    await db.webhookDelivery.create({
      data: { id: "old-one", receivedAt: ago(9) },
    });

    await runRetentionSweep();

    const row = await db.studioSettings.findUniqueOrThrow({
      where: { id: "default" },
    });
    expect(row.retentionLastRunAt).not.toBeNull();
    expect(row.retentionLastInfo).toContain("webhook deliveries");
  });

  it("says so plainly when there was nothing to do", () => {
    expect(
      describeRetention({
        loginAttempts: 0,
        authTokens: 0,
        webhookDeliveries: 0,
        activity: 0,
        chatMessages: 0,
        aiUsage: 0,
        outreachMessages: 0,
        meetings: 0,
      }),
    ).toBe("Nothing to remove");
  });
});
