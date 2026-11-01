"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { checkBudgetThreshold } from "@/lib/budget";
import { dayKeyToDate } from "@/lib/time";
import { parseCellHours, readCellName, setCellHours } from "@/lib/timesheet";
import type { ActionState } from "@/components/ui/form";

/**
 * The week grid submits one field per editable cell, named
 * `cell:<ticketId>:<YYYY-MM-DD>`. A cell is only editable when the person has
 * zero or one entry that day for that ticket, so saving can never silently
 * merge several entries into one and lose their notes.
 */
export async function saveTimesheetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canEditProject(user))
    return { error: "You don't have permission to do that" };

  const cells: { ticketId: string; day: string; hours: number }[] = [];

  for (const [name, value] of formData.entries()) {
    // Named by the same function the grid names them with, so the two cannot
    // drift apart and quietly agree on nothing.
    const cell = readCellName(name);
    if (!cell) continue;
    const { ticketId, day } = cell;

    const hours = parseCellHours(String(value));
    if (hours === null)
      return { error: `"${value}" is not a valid number of hours` };
    if (hours > 24)
      return { error: "A single day can't hold more than 24 hours" };

    cells.push({ ticketId, day, hours });
  }

  if (cells.length === 0) return { ok: true };

  const ticketIds = [...new Set(cells.map((c) => c.ticketId))];
  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, projectId: true },
  });
  const projectByTicket = new Map(tickets.map((t) => [t.id, t.projectId]));

  // Access is checked per project, once.
  const projectIds = [...new Set(tickets.map((t) => t.projectId))];
  for (const projectId of projectIds) {
    if (!(await canAccessProject(user, projectId))) {
      return {
        error: "One of the tickets belongs to a project you can't access",
      };
    }
  }

  const touchedProjects = new Set<string>();

  for (const cell of cells) {
    const projectId = projectByTicket.get(cell.ticketId);
    if (!projectId) continue;

    const outcome = await setCellHours({
      userId: user.id,
      ticketId: cell.ticketId,
      day: cell.day,
      hours: cell.hours,
    });

    if (outcome !== "unchanged" && outcome !== "conflict") {
      touchedProjects.add(projectId);
    }
  }

  for (const projectId of touchedProjects) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (project) await checkBudgetThreshold(project);
    revalidatePath(`/projects/${projectId}`, "layout");
  }

  revalidatePath("/timesheet");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Adds a ticket row to the current week so it can be filled in. */
export async function addTimesheetEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canEditProject(user))
    return { error: "You don't have permission to do that" };

  const ticketId = String(formData.get("ticketId") ?? "");
  const day = String(formData.get("day") ?? "");
  const hours = parseCellHours(String(formData.get("hours") ?? ""));

  if (!ticketId) return { error: "Pick a ticket" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick a day" };
  if (hours === null || hours <= 0) return { error: "Enter the hours" };
  if (hours > 24) return { error: "A single entry can't exceed 24 hours" };

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { projectId: true },
  });
  if (!ticket) return { error: "Ticket not found" };
  if (!(await canAccessProject(user, ticket.projectId))) {
    return { error: "Project is not accessible" };
  }

  await prisma.workLog.create({
    data: {
      ticketId,
      userId: user.id,
      hours,
      spentOn: dayKeyToDate(day),
      description: String(formData.get("description") ?? "").trim() || null,
    },
  });

  const project = await prisma.project.findUnique({
    where: { id: ticket.projectId },
  });
  if (project) await checkBudgetThreshold(project);

  revalidatePath("/timesheet");
  revalidatePath(`/projects/${ticket.projectId}`, "layout");
  revalidatePath("/dashboard");
  return { ok: true };
}
