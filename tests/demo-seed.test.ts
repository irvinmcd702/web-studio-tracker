import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedDemoData } from "../lib/demo-seed";
import { db, makeProject, makeWorkflow, resetDb } from "./setup/db";

describe("the demo data", () => {
  let logged: string[];

  beforeEach(async () => {
    await resetDb();
    logged = [];
    vi.spyOn(console, "log").mockImplementation((...a) =>
      logged.push(a.join(" ")),
    );
    process.env.SEED_DEMO_DATA = "true";
    process.env.DEMO_PASSWORD = "demo-password-for-the-test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SEED_DEMO_DATA;
    delete process.env.DEMO_PASSWORD;
  });

  it("does nothing without the variable", async () => {
    delete process.env.SEED_DEMO_DATA;
    await seedDemoData();
    expect(await db.project.count()).toBe(0);
  });

  it("refuses to land on top of an existing project", async () => {
    const workflow = await makeWorkflow();
    await makeProject({ workflowId: workflow.id, name: "Real work" });

    await seedDemoData();

    expect(await db.project.count()).toBe(1);
    expect(await db.client.count()).toBe(0);
    expect(logged.join("\n")).toContain("already exist");
  });

  it("leaves an account that was already there alone", async () => {
    const owner = await db.user.create({
      data: {
        email: "owner@studio.com",
        handle: "owner",
        name: "The Owner",
        role: "ADMIN",
        passwordHash: "untouched",
      },
    });

    await seedDemoData();

    const after = await db.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(after.passwordHash).toBe("untouched");
    expect(after.name).toBe("The Owner");
  });

  it("builds workflows from three statuses up to a release process", async () => {
    await seedDemoData();

    const workflows = await db.workflow.findMany({
      include: { statuses: true, transitions: true },
      orderBy: { name: "asc" },
    });

    expect(workflows.map((w) => w.name)).toEqual([
      "1 · Simple",
      "2 · With review",
      "3 · Full development",
      "4 · Design",
    ]);

    // Simplest first, and each one really is bigger than the last.
    const sizes = workflows.map((w) => w.statuses.length);
    expect(sizes[0]).toBe(3);
    expect(sizes[3]).toBeGreaterThan(sizes[0]!);

    // The simple one has no rules at all; the full one does.
    const simple = workflows[0]!;
    expect(simple.transitions.every((t) => !t.conditions && !t.hooks)).toBe(
      true,
    );

    const full = workflows[2]!;
    expect(full.transitions.some((t) => t.conditions)).toBe(true);
    expect(full.transitions.some((t) => t.hooks)).toBe(true);
    // A catch-all arrow back to the start.
    expect(full.transitions.some((t) => t.fromStatusId === null)).toBe(true);
  });

  it("creates clients, people and projects across those workflows", async () => {
    await seedDemoData();

    expect(await db.client.count()).toBe(4);
    expect(await db.user.count({ where: { role: "MEMBER" } })).toBe(4);
    expect(await db.user.count({ where: { role: "MANAGER" } })).toBe(2);
    expect(await db.user.count({ where: { role: "CLIENT" } })).toBe(3);

    const projects = await db.project.findMany({ include: { workflow: true } });
    expect(projects).toHaveLength(5);
    // Every workflow is actually demonstrated by a project.
    expect(new Set(projects.map((p) => p.workflowId)).size).toBe(4);
    expect(projects.some((p) => p.budgetType === "FIXED")).toBe(true);
    expect(projects.some((p) => p.status === "ON_HOLD")).toBe(true);
  });

  it("gives the dashboard something to say on the first open", async () => {
    await seedDemoData();

    const now = new Date();
    // An overdue ticket, a client waiting for an answer, and an approval that
    // has been sitting with the client — the three things the panel is for.
    expect(
      await db.ticket.count({
        where: { dueDate: { lt: now }, status: { category: { not: "DONE" } } },
      }),
    ).toBeGreaterThan(0);

    const lastMessage = await db.chatMessage.findFirst({
      where: { isInternal: false },
      orderBy: { createdAt: "desc" },
      include: { author: true },
    });
    expect(lastMessage?.author.role).toBe("CLIENT");

    expect(await db.approval.count({ where: { status: "PENDING" } })).toBe(1);
  });

  it("logs hours, so a budget means something", async () => {
    await seedDemoData();

    const hours = await db.workLog.aggregate({ _sum: { hours: true } });
    expect(hours._sum.hours).toBeGreaterThan(80);
  });

  it("prints the accounts once, with the password", async () => {
    await seedDemoData();

    const out = logged.join("\n");
    expect(out).toContain("Demo data created");
    expect(out).toContain("demo-password-for-the-test");
    expect(out).toContain("maria@demo.studio");
    expect(out).toContain("john@acme.example");
  });

  it("does not run a second time", async () => {
    await seedDemoData();
    const projects = await db.project.count();

    await seedDemoData();

    expect(await db.project.count()).toBe(projects);
  });
});

describe("resuming a run that failed halfway", () => {
  beforeEach(async () => {
    await resetDb();
    vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.SEED_DEMO_DATA = "true";
    process.env.DEMO_PASSWORD = "demo-password-for-the-test";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SEED_DEMO_DATA;
    delete process.env.DEMO_PASSWORD;
  });

  it("finishes the job rather than colliding with what it already made", async () => {
    await seedDemoData();
    const first = {
      projects: await db.project.count(),
      workflows: await db.workflow.count(),
      transitions: await db.workflowTransition.count(),
      tickets: await db.ticket.count(),
      clients: await db.client.count(),
    };

    // A second start must be a no-op, not a duplication and not a crash.
    await seedDemoData();

    expect({
      projects: await db.project.count(),
      workflows: await db.workflow.count(),
      transitions: await db.workflowTransition.count(),
      tickets: await db.ticket.count(),
      clients: await db.client.count(),
    }).toEqual(first);
  });

  it("still refuses when a project it does not own turns up", async () => {
    await seedDemoData();
    const workflow = await makeWorkflow();
    await makeProject({ workflowId: workflow.id, key: "REALWORK" });

    const before = await db.ticket.count();
    await seedDemoData();

    expect(await db.ticket.count()).toBe(before);
  });
});
