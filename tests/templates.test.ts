import { beforeEach, describe, expect, it } from "vitest";

import {
  applyTemplateToProject,
  createTemplateFromProject,
  templateHours,
} from "../lib/templates";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

const DAY = 86_400_000;
const START = new Date("2026-06-01T00:00:00.000Z");

async function sourceProject() {
  const workflow = await makeWorkflow();
  const author = await makeUser({ role: "MANAGER" });
  const dev = await makeUser();
  const project = await makeProject({
    workflowId: workflow.id,
    status: "ACTIVE",
    startDate: START,
    budgetType: "HOURLY",
    budgetHours: 120,
    hourlyRate: 70,
    currency: "EUR",
    portalShowMoney: false,
    portalShowTeam: true,
  });

  const doing = workflow.statuses.find((s) => s.category === "IN_PROGRESS")!;

  await makeTicket(project.id, workflow.statuses[0]!.id, {
    title: "Set up the repository",
    description: "CI, environments, branch protection.",
    acceptance: "- [ ] CI runs on every push",
    type: "CHORE",
    priority: "HIGH",
    estimate: 4,
    dueDate: new Date(START.getTime() + 7 * DAY),
    isClientVisible: true,
  });
  await makeTicket(project.id, doing.id, {
    title: "Homepage",
    estimate: 12,
    dueDate: new Date(START.getTime() + 21 * DAY),
    assigneeId: dev.id,
  });
  await makeTicket(project.id, workflow.statuses[0]!.id, {
    title: "Contact form",
    // No date at all.
    estimate: 6,
  });

  return { workflow, project, author, dev };
}

describe("saving a project as a template", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("keeps what the job needed", async () => {
    const { project, author } = await sourceProject();

    const result = await createTemplateFromProject({
      projectId: project.id,
      name: "Small marketing site",
      description: "  Five pages and a form.  ",
      authorId: author.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.template.name).toBe("Small marketing site");
    expect(result.template.description).toBe("Five pages and a form.");
    expect(result.template.budgetHours).toBe(120);
    expect(result.template.hourlyRate).toBe(70);
    expect(result.template.currency).toBe("EUR");
    // The portal answers travel with it — they are part of the shape.
    expect(result.template.portalShowMoney).toBe(false);
    expect(result.template.portalShowTeam).toBe(true);
    expect(result.template.items).toHaveLength(3);
  });

  it("turns a due date into days after the start, and nothing else", async () => {
    const { project, author } = await sourceProject();

    const result = await createTemplateFromProject({
      projectId: project.id,
      name: "T",
      authorId: author.id,
    });
    if (!result.ok) return;

    const byTitle = Object.fromEntries(
      result.template.items.map((i) => [i.title, i]),
    );

    expect(byTitle["Set up the repository"]!.dueAfterDays).toBe(7);
    expect(byTitle["Homepage"]!.dueAfterDays).toBe(21);
    // No date on the source means no date in the template, not day zero.
    expect(byTitle["Contact form"]!.dueAfterDays).toBeNull();
  });

  it("carries no dates at all when the project never had a start", async () => {
    const workflow = await makeWorkflow();
    const author = await makeUser();
    const project = await makeProject({ workflowId: workflow.id });
    await makeTicket(project.id, workflow.statuses[0]!.id, {
      dueDate: new Date("2026-09-01"),
    });

    const result = await createTemplateFromProject({
      projectId: project.id,
      name: "No start",
      authorId: author.id,
    });
    if (!result.ok) return;

    // There is nothing to measure "so many days after" from.
    expect(result.template.items[0]!.dueAfterDays).toBeNull();
  });

  it("says so rather than throwing when the project is gone", async () => {
    const author = await makeUser();
    const result = await createTemplateFromProject({
      projectId: "no-such-project",
      name: "T",
      authorId: author.id,
    });

    expect(result).toMatchObject({ ok: false });
  });
});

describe("starting a project from a template", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function template() {
    const { project, author } = await sourceProject();
    const result = await createTemplateFromProject({
      projectId: project.id,
      name: "Small marketing site",
      authorId: author.id,
    });
    if (!result.ok) throw new Error("could not build the template");
    return result.template;
  }

  it("creates the tickets, unassigned and at the start of the workflow", async () => {
    const t = await template();
    const workflow = await makeWorkflow();
    const fresh = await makeProject({
      workflowId: workflow.id,
      startDate: new Date("2026-09-01T00:00:00.000Z"),
    });

    const { created } = await applyTemplateToProject({
      templateId: t.id,
      projectId: fresh.id,
    });

    expect(created).toBe(3);

    const tickets = await db.ticket.findMany({
      where: { projectId: fresh.id },
      include: { status: true },
      orderBy: { number: "asc" },
    });

    expect(tickets.map((x) => x.title)).toEqual([
      "Set up the repository",
      "Homepage",
      "Contact form",
    ]);
    // Nobody is handed work by a template.
    expect(tickets.every((x) => x.assigneeId === null)).toBe(true);
    // And nothing claims progress that has not happened.
    expect(tickets.every((x) => x.status.isInitial)).toBe(true);
    expect(tickets[0]!.acceptance).toContain("CI runs on every push");
  });

  it("measures the dates from the new project's start", async () => {
    const t = await template();
    const workflow = await makeWorkflow();
    const newStart = new Date("2026-09-01T00:00:00.000Z");
    const fresh = await makeProject({
      workflowId: workflow.id,
      startDate: newStart,
    });

    await applyTemplateToProject({ templateId: t.id, projectId: fresh.id });

    const tickets = await db.ticket.findMany({
      where: { projectId: fresh.id },
      orderBy: { number: "asc" },
    });

    expect(tickets[0]!.dueDate).toEqual(new Date(newStart.getTime() + 7 * DAY));
    expect(tickets[1]!.dueDate).toEqual(
      new Date(newStart.getTime() + 21 * DAY),
    );
    expect(tickets[2]!.dueDate).toBeNull();
  });

  it("gives no date rather than today's when the new project has no start", async () => {
    const t = await template();
    const workflow = await makeWorkflow();
    const fresh = await makeProject({ workflowId: workflow.id });

    await applyTemplateToProject({ templateId: t.id, projectId: fresh.id });

    const tickets = await db.ticket.findMany({
      where: { projectId: fresh.id },
    });
    expect(tickets.every((x) => x.dueDate === null)).toBe(true);
  });

  it("moves the project's counter so the next hand-made ticket does not collide", async () => {
    const t = await template();
    const workflow = await makeWorkflow();
    const fresh = await makeProject({ workflowId: workflow.id });

    await applyTemplateToProject({ templateId: t.id, projectId: fresh.id });

    const after = await db.project.findUniqueOrThrow({
      where: { id: fresh.id },
    });
    expect(after.ticketCounter).toBe(3);

    // The unique constraint on (projectId, number) is the thing being protected.
    await expect(
      db.ticket.create({
        data: {
          projectId: fresh.id,
          statusId: workflow.statuses[0]!.id,
          number: after.ticketCounter + 1,
          title: "By hand",
        },
      }),
    ).resolves.toBeTruthy();
  });

  it("appends rather than overwrites when the project already has tickets", async () => {
    const t = await template();
    const workflow = await makeWorkflow();
    const fresh = await makeProject({ workflowId: workflow.id });
    await makeTicket(fresh.id, workflow.statuses[0]!.id, { title: "Existing" });

    await applyTemplateToProject({ templateId: t.id, projectId: fresh.id });

    const titles = (
      await db.ticket.findMany({
        where: { projectId: fresh.id },
        orderBy: { number: "asc" },
      })
    ).map((x) => x.title);

    expect(titles[0]).toBe("Existing");
    expect(titles).toHaveLength(4);
  });

  it("does nothing at all for a template that no longer exists", async () => {
    const workflow = await makeWorkflow();
    const fresh = await makeProject({ workflowId: workflow.id });

    const result = await applyTemplateToProject({
      templateId: "gone",
      projectId: fresh.id,
    });

    expect(result.created).toBe(0);
    expect(await db.ticket.count()).toBe(0);
  });
});

describe("the hours in a template", () => {
  it("adds up only what was estimated", () => {
    expect(templateHours([{ estimate: 4 }, { estimate: 6 }])).toBe(10);
    expect(templateHours([{ estimate: 4 }, { estimate: null }])).toBe(4);
  });

  it("says nothing when nothing was estimated", () => {
    // Zero would read as "this job takes no time".
    expect(templateHours([{ estimate: null }])).toBeNull();
    expect(templateHours([])).toBeNull();
  });
});
