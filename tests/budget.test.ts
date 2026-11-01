import { beforeEach, describe, expect, it } from "vitest";

import { checkBudgetThreshold, projectBudget } from "../lib/budget";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

describe("projectBudget", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("computes spend, percentage and money for an hourly project", async () => {
    const workflow = await makeWorkflow();
    const user = await makeUser();
    const project = await makeProject({
      workflowId: workflow.id,
      budgetType: "HOURLY",
      budgetHours: 100,
      hourlyRate: 50,
      currency: "USD",
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id, {
      estimate: 30,
    });

    await db.workLog.createMany({
      data: [
        { ticketId: ticket.id, userId: user.id, hours: 10 },
        { ticketId: ticket.id, userId: user.id, hours: 15 },
      ],
    });

    const budget = await projectBudget(
      await db.project.findUniqueOrThrow({ where: { id: project.id } }),
    );

    expect(budget.spentHours).toBe(25);
    expect(budget.estimatedHours).toBe(30);
    expect(budget.usedPercent).toBe(25);
    expect(budget.remainingHours).toBe(75);
    expect(budget.spentAmount).toBe(1250);
    expect(budget.contractAmount).toBe(5000);
    expect(budget.isOverBudget).toBe(false);
  });

  it("flags an overrun", async () => {
    const workflow = await makeWorkflow();
    const user = await makeUser();
    const project = await makeProject({
      workflowId: workflow.id,
      budgetType: "HOURLY",
      budgetHours: 10,
      hourlyRate: 100,
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);
    await db.workLog.create({
      data: { ticketId: ticket.id, userId: user.id, hours: 12 },
    });

    const budget = await projectBudget(
      await db.project.findUniqueOrThrow({ where: { id: project.id } }),
    );
    expect(budget.isOverBudget).toBe(true);
    expect(budget.usedPercent).toBe(120);
    expect(budget.remainingHours).toBe(-2);
  });

  it("reports no hourly amount for a fixed-price project", async () => {
    const workflow = await makeWorkflow();
    const user = await makeUser();
    const project = await makeProject({
      workflowId: workflow.id,
      budgetType: "FIXED",
      fixedAmount: 9000,
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);
    await db.workLog.create({
      data: { ticketId: ticket.id, userId: user.id, hours: 8 },
    });

    const budget = await projectBudget(
      await db.project.findUniqueOrThrow({ where: { id: project.id } }),
    );
    expect(budget.spentHours).toBe(8);
    expect(budget.budgetHours).toBeNull();
    expect(budget.usedPercent).toBeNull();
    expect(budget.spentAmount).toBeNull();
    expect(budget.contractAmount).toBe(9000);
  });
});

describe("checkBudgetThreshold", () => {
  beforeEach(async () => {
    await resetDb();
  });

  const setup = async (budgetHours: number) => {
    const workflow = await makeWorkflow();
    const user = await makeUser();
    const project = await makeProject({
      workflowId: workflow.id,
      budgetType: "HOURLY",
      budgetHours,
      hourlyRate: 10,
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);
    return { user, ticket, projectId: project.id };
  };

  const reload = (id: string) =>
    db.project.findUniqueOrThrow({ where: { id } });

  const log = (ticketId: string, userId: string, hours: number) =>
    db.workLog.create({ data: { ticketId, userId, hours } });

  it("stays quiet below 80%", async () => {
    const { user, ticket, projectId } = await setup(100);
    await log(ticket.id, user.id, 70);
    await checkBudgetThreshold(await reload(projectId));
    expect((await reload(projectId)).budgetAlertLevel).toBe(0);
  });

  it("marks 80 once and does not re-mark on further hours", async () => {
    const { user, ticket, projectId } = await setup(100);

    await log(ticket.id, user.id, 85);
    await checkBudgetThreshold(await reload(projectId));
    expect((await reload(projectId)).budgetAlertLevel).toBe(80);

    await log(ticket.id, user.id, 5);
    await checkBudgetThreshold(await reload(projectId));
    expect((await reload(projectId)).budgetAlertLevel).toBe(80);
  });

  it("escalates to 100 when the budget is used up", async () => {
    const { user, ticket, projectId } = await setup(100);

    await log(ticket.id, user.id, 85);
    await checkBudgetThreshold(await reload(projectId));

    await log(ticket.id, user.id, 20);
    await checkBudgetThreshold(await reload(projectId));
    expect((await reload(projectId)).budgetAlertLevel).toBe(100);
  });

  it("resets the level when the budget is raised, so the warning can fire again", async () => {
    const { user, ticket, projectId } = await setup(100);

    await log(ticket.id, user.id, 100);
    await checkBudgetThreshold(await reload(projectId));
    expect((await reload(projectId)).budgetAlertLevel).toBe(100);

    await db.project.update({
      where: { id: projectId },
      data: { budgetHours: 400 },
    });
    await checkBudgetThreshold(await reload(projectId));
    expect((await reload(projectId)).budgetAlertLevel).toBe(0);
  });

  it("ignores fixed-price projects and projects without an hour budget", async () => {
    const workflow = await makeWorkflow();
    const user = await makeUser();

    const fixed = await makeProject({
      workflowId: workflow.id,
      budgetType: "FIXED",
      fixedAmount: 1000,
    });
    const fixedTicket = await makeTicket(fixed.id, workflow.statuses[0]!.id);
    await log(fixedTicket.id, user.id, 500);
    await checkBudgetThreshold(await reload(fixed.id));
    expect((await reload(fixed.id)).budgetAlertLevel).toBe(0);

    const uncapped = await makeProject({
      workflowId: workflow.id,
      budgetType: "HOURLY",
      budgetHours: null,
    });
    const uncappedTicket = await makeTicket(
      uncapped.id,
      workflow.statuses[0]!.id,
    );
    await log(uncappedTicket.id, user.id, 500);
    await checkBudgetThreshold(await reload(uncapped.id));
    expect((await reload(uncapped.id)).budgetAlertLevel).toBe(0);
  });
});
