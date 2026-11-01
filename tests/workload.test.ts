import { beforeEach, describe, expect, it } from "vitest";

import { collectWorkload, pressure, pressureTone } from "../lib/workload";
import { addDays, weekStart } from "../lib/time";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

/** A Wednesday, so "this week" has days on both sides of it. */
const NOW = new Date("2026-06-17T12:00:00.000Z");
const MONDAY = weekStart(NOW);

const inWeek = (n: number, dayOffset = 2) => addDays(MONDAY, n * 7 + dayOffset);

async function live() {
  const workflow = await makeWorkflow();
  const project = await makeProject({
    workflowId: workflow.id,
    status: "ACTIVE",
  });
  return { workflow, project, todo: workflow.statuses[0]!.id };
}

const rowFor = (w: Awaited<ReturnType<typeof collectWorkload>>, id: string) =>
  w.rows.find((r) => r.user.id === id)!;

describe("what a week is committed to", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("puts a ticket's remaining hours in the week it is due", async () => {
    const dev = await makeUser({ weeklyCapacity: 40 });
    const { project, todo } = await live();

    await makeTicket(project.id, todo, {
      estimate: 10,
      dueDate: inWeek(0),
      assigneeId: dev.id,
    });
    await makeTicket(project.id, todo, {
      estimate: 6,
      dueDate: inWeek(2),
      assigneeId: dev.id,
    });

    const row = rowFor(await collectWorkload({ now: NOW }), dev.id);

    expect(row.weeks[0]!.committed).toBe(10);
    expect(row.weeks[1]!.committed).toBe(0);
    expect(row.weeks[2]!.committed).toBe(6);
  });

  it("counts what is left, not what was estimated", async () => {
    const dev = await makeUser();
    const { project, todo } = await live();
    const ticket = await makeTicket(project.id, todo, {
      estimate: 12,
      dueDate: inWeek(0),
      assigneeId: dev.id,
    });
    await db.workLog.create({
      data: { ticketId: ticket.id, userId: dev.id, hours: 8, spentOn: NOW },
    });

    const row = rowFor(await collectWorkload({ now: NOW }), dev.id);

    expect(row.weeks[0]!.committed).toBe(4);
  });

  it("never goes negative when the estimate was beaten", async () => {
    const dev = await makeUser();
    const { project, todo } = await live();
    const ticket = await makeTicket(project.id, todo, {
      estimate: 4,
      dueDate: inWeek(0),
      assigneeId: dev.id,
    });
    await db.workLog.create({
      data: { ticketId: ticket.id, userId: dev.id, hours: 11, spentOn: NOW },
    });

    const row = rowFor(await collectWorkload({ now: NOW }), dev.id);

    // Overrunning an estimate does not lend hours back to the week.
    expect(row.weeks[0]!.committed).toBe(0);
  });

  it("keeps overdue work out of the weeks", async () => {
    const dev = await makeUser();
    const { project, todo } = await live();
    await makeTicket(project.id, todo, {
      estimate: 9,
      dueDate: addDays(MONDAY, -3),
      assigneeId: dev.id,
    });

    const row = rowFor(await collectWorkload({ now: NOW }), dev.id);

    // It should already have happened; dropping it into this week would be
    // rescheduling it on somebody's behalf.
    expect(row.overdueHours).toBe(9);
    expect(row.overdueTickets).toBe(1);
    expect(row.weeks.every((w) => w.committed === 0)).toBe(true);
  });

  it("separates work with no date from work with no estimate", async () => {
    const dev = await makeUser();
    const { project, todo } = await live();

    await makeTicket(project.id, todo, { estimate: 7, assigneeId: dev.id });
    await makeTicket(project.id, todo, {
      dueDate: inWeek(1),
      assigneeId: dev.id,
    });

    const row = rowFor(await collectWorkload({ now: NOW }), dev.id);

    expect(row.undatedHours).toBe(7);
    // A count, never hours: a guess would look like the other numbers.
    expect(row.unestimated).toBe(1);
    expect(row.weeks[1]!.committed).toBe(0);
  });

  it("ignores work that is finished, and projects nobody is working on", async () => {
    const dev = await makeUser();
    const { workflow, project, todo } = await live();
    const done = workflow.statuses.find((s) => s.category === "DONE")!.id;

    await makeTicket(project.id, done, {
      estimate: 20,
      dueDate: inWeek(0),
      assigneeId: dev.id,
    });

    const archived = await makeProject({
      workflowId: workflow.id,
      status: "ARCHIVED",
    });
    await makeTicket(archived.id, todo, {
      estimate: 30,
      dueDate: inWeek(0),
      assigneeId: dev.id,
    });

    const row = rowFor(await collectWorkload({ now: NOW }), dev.id);

    expect(row.weeks[0]!.committed).toBe(0);
  });

  it("gathers what nobody is holding rather than dropping it", async () => {
    const { project, todo } = await live();
    await makeTicket(project.id, todo, { estimate: 5, dueDate: inWeek(0) });
    await makeTicket(project.id, todo, { estimate: 3 });

    const workload = await collectWorkload({ now: NOW });

    expect(workload.unassigned).toEqual({ hours: 8, tickets: 2 });
  });

  it("shows what was actually logged beside what was planned", async () => {
    const dev = await makeUser();
    const { project, todo } = await live();
    const ticket = await makeTicket(project.id, todo, {
      estimate: 10,
      dueDate: inWeek(0),
      assigneeId: dev.id,
    });
    await db.workLog.create({
      data: {
        ticketId: ticket.id,
        userId: dev.id,
        hours: 3,
        spentOn: addDays(MONDAY, 1),
      },
    });

    const row = rowFor(await collectWorkload({ now: NOW }), dev.id);

    expect(row.weeks[0]!.logged).toBe(3);
    expect(row.weeks[0]!.committed).toBe(7);
  });

  it("leaves out clients and people who have gone", async () => {
    await makeUser({ role: "CLIENT" });
    await makeUser({ isActive: false });
    const active = await makeUser();

    const workload = await collectWorkload({ now: NOW });

    expect(workload.rows.map((r) => r.user.id)).toEqual([active.id]);
  });

  it("does not reach past the horizon it was asked for", async () => {
    const dev = await makeUser();
    const { project, todo } = await live();
    await makeTicket(project.id, todo, {
      estimate: 40,
      dueDate: inWeek(9),
      assigneeId: dev.id,
    });

    const workload = await collectWorkload({ now: NOW, weeks: 3 });
    const row = rowFor(workload, dev.id);

    expect(workload.weeks).toHaveLength(3);
    expect(row.weeks.every((w) => w.committed === 0)).toBe(true);
    // Not counted as overdue or undated either — it is simply further out.
    expect(row.overdueHours).toBe(0);
    expect(row.undatedHours).toBe(0);
  });
});

describe("how hard a week is pushing", () => {
  const week = (committed: number) => ({
    start: "2026-06-15",
    committed,
    logged: 0,
    tickets: 1,
  });

  it("is a fraction of capacity", () => {
    expect(pressure(week(20), 40)).toBe(0.5);
  });

  it("says nothing when there is no capacity to compare against", () => {
    // Somebody on leave has no week; that is not the same as an easy week.
    expect(pressure(week(10), 0)).toBeNull();
    expect(pressureTone(null)).toBe("unknown");
  });

  it("only calls a week tight when it is nearly full", () => {
    expect(pressureTone(pressure(week(0), 40))).toBe("empty");
    expect(pressureTone(pressure(week(20), 40))).toBe("fine");
    expect(pressureTone(pressure(week(36), 40))).toBe("tight");
    expect(pressureTone(pressure(week(44), 40))).toBe("over");
  });
});
