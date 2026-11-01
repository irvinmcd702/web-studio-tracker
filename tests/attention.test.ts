import { beforeEach, describe, expect, it } from "vitest";

import {
  collectSignals,
  signalsFor,
  type AttentionRules,
  type Signal,
} from "../lib/attention";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

/**
 * A fixed clock. Every row below is created at an offset from it, so a rule
 * that is off by a day fails the test instead of failing in December.
 */
const NOW = new Date("2026-06-15T12:00:00.000Z");
const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);

const RULES: AttentionRules = {
  remindDueWithinDays: 2,
  remindStalledDays: 3,
  remindApprovalDays: 3,
  remindClientReplyHours: 24,
  remindTimerHours: 10,
  remindBudgetPace: true,
  remindOutreachReplyHours: 24,
  remindOutreachApprovalDays: 3,
};

const run = (rules: Partial<AttentionRules> = {}) =>
  collectSignals({ now: NOW, rules: { ...RULES, ...rules } });

const kinds = (signals: Signal[]) => signals.map((s) => s.kind);
const find = (signals: Signal[], kind: string) =>
  signals.find((s) => s.kind === kind);

async function liveProject(overrides: Record<string, unknown> = {}) {
  const workflow = await makeWorkflow();
  const project = await makeProject({
    workflowId: workflow.id,
    status: "ACTIVE",
    ...overrides,
  });
  return { workflow, project };
}

describe("attention rules", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("flags an overdue ticket and addresses it to whoever holds it", async () => {
    const dev = await makeUser();
    const { workflow, project } = await liveProject();
    await makeTicket(project.id, workflow.statuses[0]!.id, {
      title: "Ship the checkout",
      dueDate: at(-3),
      assigneeId: dev.id,
    });

    const signals = await run();
    const overdue = find(signals, "ticket.overdue");

    expect(overdue).toBeDefined();
    expect(overdue!.severity).toBe("high");
    expect(overdue!.detail).toContain("3 days late");
    expect(overdue!.audience).toEqual([dev.id]);
  });

  it("hands an overdue ticket nobody owns to the project manager", async () => {
    const pm = await makeUser({ role: "MANAGER" });
    const { workflow, project } = await liveProject({ managerId: pm.id });
    await makeTicket(project.id, workflow.statuses[0]!.id, {
      dueDate: at(-1),
    });

    const overdue = find(await run(), "ticket.overdue")!;

    expect(overdue.audience).toEqual([pm.id]);
    expect(overdue.detail).toContain("nobody is assigned");
  });

  it("warns inside the window and stays quiet outside it", async () => {
    const { workflow, project } = await liveProject();
    await makeTicket(project.id, workflow.statuses[0]!.id, {
      title: "Soon",
      dueDate: at(1),
    });
    await makeTicket(project.id, workflow.statuses[0]!.id, {
      title: "Later",
      dueDate: at(9),
    });

    const soon = (await run()).filter((s) => s.kind === "ticket.due_soon");

    expect(soon).toHaveLength(1);
    expect(soon[0]!.title).toContain("Soon");
    expect(soon[0]!.detail).toBe("Due in 1 day");
  });

  it("says nothing about a ticket that is already done", async () => {
    const { workflow, project } = await liveProject();
    const done = workflow.statuses.find((s) => s.category === "DONE")!;
    await makeTicket(project.id, done.id, { dueDate: at(-10) });

    expect(kinds(await run())).not.toContain("ticket.overdue");
  });

  it("ignores projects nobody is working on", async () => {
    const workflow = await makeWorkflow();
    const project = await makeProject({
      workflowId: workflow.id,
      status: "ARCHIVED",
      dueDate: at(-5),
    });
    await makeTicket(project.id, workflow.statuses[0]!.id, {
      dueDate: at(-5),
    });

    expect(await run()).toEqual([]);
  });

  it("treats zero as off", async () => {
    const { workflow, project } = await liveProject();
    await makeTicket(project.id, workflow.statuses[0]!.id, { dueDate: at(1) });

    expect(kinds(await run())).toContain("ticket.due_soon");
    expect(kinds(await run({ remindDueWithinDays: 0 }))).not.toContain(
      "ticket.due_soon",
    );
  });

  it("calls in-progress work stalled only when no time is being logged", async () => {
    const dev = await makeUser();
    const { workflow, project } = await liveProject();
    const doing = workflow.statuses.find((s) => s.category === "IN_PROGRESS")!;

    const abandoned = await makeTicket(project.id, doing.id, {
      title: "Abandoned",
      assigneeId: dev.id,
      updatedAt: at(-6),
    });
    const worked = await makeTicket(project.id, doing.id, {
      title: "Worked on",
      assigneeId: dev.id,
      updatedAt: at(-6),
    });
    await db.workLog.create({
      data: { ticketId: worked.id, userId: dev.id, hours: 2, spentOn: at(-1) },
    });

    const stalled = (await run()).filter((s) => s.kind === "ticket.stalled");

    expect(stalled).toHaveLength(1);
    expect(stalled[0]!.title).toContain("Abandoned");
    expect(stalled[0]!.href).toBe(`/tickets/${abandoned.id}`);
  });

  it("chases an approval the client has been sitting on", async () => {
    const pm = await makeUser({ role: "MANAGER" });
    const { project } = await liveProject({ managerId: pm.id });

    await db.approval.create({
      data: {
        projectId: project.id,
        title: "Homepage design",
        status: "PENDING",
        requestedAt: at(-6),
      },
    });
    await db.approval.create({
      data: {
        projectId: project.id,
        title: "Just sent",
        status: "PENDING",
        requestedAt: at(-1),
      },
    });

    const waiting = (await run()).filter((s) => s.kind === "approval.waiting");

    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.title).toContain("Homepage design");
    expect(waiting[0]!.detail).toContain("6 days");
    expect(waiting[0]!.audience).toEqual([pm.id]);
  });

  it("flags a client message nobody answered, and only that case", async () => {
    const pm = await makeUser({ role: "MANAGER" });
    const client = await db.client.create({ data: { name: "Acme" } });
    const customer = await makeUser({ role: "CLIENT", clientId: client.id });

    const ignored = await liveProject({
      managerId: pm.id,
      clientId: client.id,
    });
    const answered = await liveProject({
      managerId: pm.id,
      clientId: client.id,
    });

    await db.chatMessage.create({
      data: {
        projectId: ignored.project.id,
        authorId: customer.id,
        body: "Any news?",
        createdAt: hoursAgo(30),
      },
    });

    await db.chatMessage.createMany({
      data: [
        {
          projectId: answered.project.id,
          authorId: customer.id,
          body: "Any news?",
          createdAt: hoursAgo(30),
        },
        {
          projectId: answered.project.id,
          authorId: pm.id,
          body: "Tomorrow.",
          createdAt: hoursAgo(28),
        },
      ],
    });

    const unanswered = (await run()).filter(
      (s) => s.kind === "chat.unanswered",
    );

    expect(unanswered).toHaveLength(1);
    expect(unanswered[0]!.projectId).toBe(ignored.project.id);
    expect(unanswered[0]!.detail).toContain("30h ago");
  });

  it("does not count an internal note as an answer", async () => {
    const pm = await makeUser({ role: "MANAGER" });
    const client = await db.client.create({ data: { name: "Acme" } });
    const customer = await makeUser({ role: "CLIENT", clientId: client.id });
    const { project } = await liveProject({
      managerId: pm.id,
      clientId: client.id,
    });

    await db.chatMessage.createMany({
      data: [
        {
          projectId: project.id,
          authorId: customer.id,
          body: "Any news?",
          createdAt: hoursAgo(30),
        },
        {
          projectId: project.id,
          authorId: pm.id,
          body: "Who is picking this up?",
          isInternal: true,
          createdAt: hoursAgo(2),
        },
      ],
    });

    expect(kinds(await run())).toContain("chat.unanswered");
  });

  it("projects an overrun from the burn rate", async () => {
    const dev = await makeUser();
    const pm = await makeUser({ role: "MANAGER" });
    const { workflow, project } = await liveProject({
      managerId: pm.id,
      budgetType: "HOURLY",
      budgetHours: 100,
      hourlyRate: 50,
      startDate: at(-10),
      dueDate: at(20),
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);
    await db.workLog.create({
      data: { ticketId: ticket.id, userId: dev.id, hours: 50, spentOn: at(-2) },
    });

    const pace = find(await run(), "budget.pace")!;

    // 50h in 10 days is 5h/day; 20 days left would add 100 more.
    expect(pace.detail).toContain("50h of 100h used");
    expect(pace.audience).toEqual([pm.id]);
  });

  it("leaves the overrun alone once it has actually happened", async () => {
    const dev = await makeUser();
    const { workflow, project } = await liveProject({
      budgetType: "HOURLY",
      budgetHours: 40,
      startDate: at(-10),
      dueDate: at(20),
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);
    await db.workLog.create({
      data: { ticketId: ticket.id, userId: dev.id, hours: 50, spentOn: at(-2) },
    });

    expect(kinds(await run())).not.toContain("budget.pace");
  });

  it("tells one person their stopwatch is still running", async () => {
    const dev = await makeUser();
    const pm = await makeUser({ role: "MANAGER" });
    const { workflow, project } = await liveProject({ managerId: pm.id });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);

    await db.runningTimer.create({
      data: { userId: dev.id, ticketId: ticket.id, startedAt: hoursAgo(14) },
    });

    const timer = find(await run(), "timer.running")!;

    expect(timer.detail).toContain("14h");
    expect(timer.audience).toEqual([dev.id]);
    // Not the PM's problem, and not worth putting in front of them.
    expect(timer.managerial).toBe(false);
  });

  it("puts the urgent things first", async () => {
    const { workflow, project } = await liveProject();
    await makeTicket(project.id, workflow.statuses[0]!.id, { dueDate: at(1) });
    await makeTicket(project.id, workflow.statuses[0]!.id, { dueDate: at(-4) });

    expect(kinds(await run())).toEqual(["ticket.overdue", "ticket.due_soon"]);
  });
});

describe("who sees what", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("shows a developer their own work and not the project's paperwork", async () => {
    const dev = await makeUser();
    const pm = await makeUser({ role: "MANAGER" });
    const { workflow, project } = await liveProject({ managerId: pm.id });

    await makeTicket(project.id, workflow.statuses[0]!.id, {
      dueDate: at(-2),
      assigneeId: dev.id,
    });
    await db.approval.create({
      data: {
        projectId: project.id,
        title: "Design",
        status: "PENDING",
        requestedAt: at(-9),
      },
    });

    const all = await run();

    expect(kinds(signalsFor(all, { id: dev.id, role: "MEMBER" }))).toEqual([
      "ticket.overdue",
    ]);

    const pmSees = kinds(signalsFor(all, { id: pm.id, role: "MANAGER" }));
    expect(pmSees).toContain("approval.waiting");
    // A late ticket on their project is theirs to know about too.
    expect(pmSees).toContain("ticket.overdue");
  });

  it("limits the collection to the projects a person can see", async () => {
    const outsider = await makeUser();
    const stranger = await makeUser();
    const { workflow, project } = await liveProject();
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id, {
      dueDate: at(-2),
    });
    await db.runningTimer.create({
      data: {
        userId: stranger.id,
        ticketId: ticket.id,
        startedAt: hoursAgo(20),
      },
    });

    const scoped = await collectSignals({
      now: NOW,
      rules: RULES,
      scope: {
        OR: [
          { managerId: outsider.id },
          { members: { some: { userId: outsider.id } } },
          { tickets: { some: { assigneeId: outsider.id } } },
        ],
      },
    });

    expect(scoped).toEqual([]);
  });
});
