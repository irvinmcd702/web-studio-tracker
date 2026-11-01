import type { Project } from "@prisma/client";

import { prisma } from "./db";
import { notifyBudgetThreshold } from "./notify";

export type BudgetSummary = {
  spentHours: number;
  estimatedHours: number;
  budgetHours: number | null;
  /** 0–100+, null when the project has no hour budget. */
  usedPercent: number | null;
  remainingHours: number | null;
  /**
   * Of the hours above, how many were logged by a coding agent. Always
   * counted; whether anyone is shown it is a separate decision.
   */
  agentHours: number;
  /** Money burned so far — hourly projects only. */
  spentAmount: number | null;
  contractAmount: number | null;
  currency: string;
  isOverBudget: boolean;
};

export async function projectBudget(project: Project): Promise<BudgetSummary> {
  const [logs, agentLogs, estimates] = await Promise.all([
    prisma.workLog.aggregate({
      where: { ticket: { projectId: project.id } },
      _sum: { hours: true },
    }),
    prisma.workLog.aggregate({
      where: { ticket: { projectId: project.id }, source: "AGENT" },
      _sum: { hours: true },
    }),
    prisma.ticket.aggregate({
      where: { projectId: project.id },
      _sum: { estimate: true },
    }),
  ]);

  const spentHours = logs._sum.hours ?? 0;
  const agentHours = agentLogs._sum.hours ?? 0;
  const estimatedHours = estimates._sum.estimate ?? 0;
  const budgetHours =
    project.budgetType === "HOURLY" ? project.budgetHours : null;

  const usedPercent =
    budgetHours && budgetHours > 0
      ? Math.round((spentHours / budgetHours) * 100)
      : null;

  return {
    spentHours,
    agentHours,
    estimatedHours,
    budgetHours,
    usedPercent,
    remainingHours: budgetHours != null ? budgetHours - spentHours : null,
    spentAmount:
      project.budgetType === "HOURLY" && project.hourlyRate != null
        ? spentHours * project.hourlyRate
        : null,
    contractAmount:
      project.budgetType === "FIXED"
        ? project.fixedAmount
        : project.budgetHours != null && project.hourlyRate != null
          ? project.budgetHours * project.hourlyRate
          : null,
    currency: project.currency,
    isOverBudget: budgetHours != null && spentHours > budgetHours,
  };
}

/**
 * Announces the 80% and 100% budget marks once each. The level reached is
 * stored on the project, so logging another hour doesn't repeat the warning —
 * and raising the budget later lets the warning fire again.
 */
export async function checkBudgetThreshold(project: Project) {
  if (project.budgetType !== "HOURLY") return;
  if (!project.budgetHours || project.budgetHours <= 0) return;

  const logged = await prisma.workLog.aggregate({
    where: { ticket: { projectId: project.id } },
    _sum: { hours: true },
  });

  const spentHours = logged._sum.hours ?? 0;
  const percent = Math.round((spentHours / project.budgetHours) * 100);
  const level = percent >= 100 ? 100 : percent >= 80 ? 80 : 0;

  if (level === project.budgetAlertLevel) return;

  await prisma.project.update({
    where: { id: project.id },
    data: { budgetAlertLevel: level },
  });

  // Dropping back below a mark only resets the state, it isn't news.
  if (level <= project.budgetAlertLevel) return;

  await notifyBudgetThreshold({
    project,
    percent,
    spentHours,
    budgetHours: project.budgetHours,
    spentAmount:
      project.hourlyRate != null ? spentHours * project.hourlyRate : null,
    currency: project.currency,
  });
}

/** Hours logged per project, keyed by project id — used by list views. */
export async function spentHoursByProject(projectIds: string[]) {
  if (!projectIds.length) return new Map<string, number>();

  const rows = await prisma.workLog.groupBy({
    by: ["ticketId"],
    where: { ticket: { projectId: { in: projectIds } } },
    _sum: { hours: true },
  });

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: rows.map((r) => r.ticketId) } },
    select: { id: true, projectId: true },
  });
  const projectByTicket = new Map(tickets.map((t) => [t.id, t.projectId]));

  const result = new Map<string, number>();
  for (const row of rows) {
    const projectId = projectByTicket.get(row.ticketId);
    if (!projectId) continue;
    result.set(projectId, (result.get(projectId) ?? 0) + (row._sum.hours ?? 0));
  }
  return result;
}
