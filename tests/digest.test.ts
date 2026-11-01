import { beforeEach, describe, expect, it } from "vitest";

import type { Signal } from "../lib/attention";
import {
  groupByRecipient,
  renderPersonalDigest,
  renderStudioDigest,
  runDailyDigest,
} from "../lib/digest";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    key: `k${Math.random()}`,
    kind: "ticket.overdue",
    severity: "high",
    title: "ACME-1 · Something",
    detail: "2 days late",
    href: "/tickets/1",
    projectId: "p1",
    projectKey: "ACME",
    projectName: "Acme store",
    audience: ["u1"],
    managerial: true,
    ...overrides,
  };
}

describe("digest grouping", () => {
  it("gives each person only what is addressed to them", () => {
    const grouped = groupByRecipient([
      signal({ audience: ["dev"] }),
      signal({ audience: ["pm"] }),
      signal({ audience: ["dev", "pm"] }),
    ]);

    expect(grouped.get("dev")).toHaveLength(2);
    expect(grouped.get("pm")).toHaveLength(2);
    expect(grouped.has("someone-else")).toBe(false);
  });
});

describe("the letter", () => {
  it("leads with how much is actually overdue", () => {
    const { subject, text } = renderPersonalDigest({
      name: "Dana Cole",
      signals: [
        signal({ severity: "high" }),
        signal({ severity: "medium", kind: "ticket.due_soon" }),
      ],
    });

    expect(subject).toBe("1 item overdue in Studio Tracker");
    expect(text).toContain("Hello Dana,");
    expect(text).toContain("1 thing needs attention today, out of 2.");
  });

  it("says so plainly when nothing is late", () => {
    const { subject, text } = renderPersonalDigest({
      name: "Dana",
      signals: [signal({ severity: "medium", kind: "ticket.due_soon" })],
    });

    expect(subject).toBe("Your day in Studio Tracker");
    expect(text).toContain("Nothing is overdue.");
  });

  it("stops listing and counts the rest", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      signal({ title: `ACME-${i} · Thing` }),
    );

    expect(
      renderPersonalDigest({ name: "Dana", signals: many }).text,
    ).toContain("…and 8 more.");
  });

  it("groups by project so the reader knows where to look", () => {
    const text = renderPersonalDigest({
      name: "Dana",
      signals: [
        signal({ projectKey: "ACME", projectName: "Acme store" }),
        signal({ projectKey: "BFC", projectName: "Bakery" }),
      ],
    }).text;

    expect(text).toContain("ACME · Acme store");
    expect(text).toContain("BFC · Bakery");
  });
});

describe("the studio note", () => {
  it("carries only what belongs in a shared channel", () => {
    const note = renderStudioDigest([
      signal({ managerial: true }),
      signal({ managerial: false, kind: "timer.running" }),
    ]);

    expect(note).not.toBeNull();
    expect(note!.text).toContain("1 item");
    expect(JSON.stringify(note!.attachments)).not.toContain("timer");
  });

  it("is nothing at all when only personal items are left", () => {
    expect(renderStudioDigest([signal({ managerial: false })])).toBeNull();
  });
});

describe("the daily run", () => {
  beforeEach(async () => {
    await resetDb();
  });

  const settings = (data: Record<string, unknown>) =>
    db.studioSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });

  it("does nothing at all until someone turns it on", async () => {
    const result = await runDailyDigest();

    expect(result.skipped).toBe("The daily digest is switched off");
    expect(
      (await db.studioSettings.findUnique({ where: { id: "default" } }))
        ?.digestLastRunAt,
    ).toBeNull();
  });

  it("refuses to run twice in a day, and obeys an explicit force", async () => {
    await settings({ digestChatEnabled: true });

    const first = await runDailyDigest();
    expect(first.skipped).toBeUndefined();

    const second = await runDailyDigest();
    expect(second.skipped).toBe("Already ran within the last 12 hours");

    const forced = await runDailyDigest({ force: true });
    expect(forced.skipped).toBeUndefined();
  });

  it("admits when a channel was asked for but never set up", async () => {
    await settings({ digestChatEnabled: true, digestEmailEnabled: true });

    const result = await runDailyDigest();

    // Neither SMTP nor Rocket.Chat exists in a test process, and the run says
    // so rather than reporting a cheerful zero.
    expect(result.email).toBe("unconfigured");
    expect(result.chat).toBe("unconfigured");

    const row = await db.studioSettings.findUnique({
      where: { id: "default" },
    });
    expect(row?.digestLastRunAt).not.toBeNull();
    expect(row?.digestLastInfo).toContain("email unconfigured");
  });

  it("counts the signals it found", async () => {
    await settings({ digestChatEnabled: true });

    const workflow = await makeWorkflow();
    const dev = await makeUser();
    const project = await makeProject({
      workflowId: workflow.id,
      status: "ACTIVE",
    });
    await makeTicket(project.id, workflow.statuses[0]!.id, {
      dueDate: new Date(Date.now() - 5 * 86_400_000),
      assigneeId: dev.id,
    });

    expect((await runDailyDigest()).signals).toBe(1);
  });
});
