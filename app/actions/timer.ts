"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { checkBudgetThreshold } from "@/lib/budget";
import { msToHours } from "@/lib/time";
import type { ActionState } from "@/components/ui/form";

/** Anything shorter than this is treated as a misclick and thrown away. */
const MIN_TRACKED_MS = 60_000;

async function assertTracker(projectId: string) {
  const user = await requireUser();
  if (!canEditProject(user))
    throw new Error("You don't have permission to do that");
  if (!(await canAccessProject(user, projectId))) {
    throw new Error("Project is not accessible");
  }
  return user;
}

/**
 * Turns a running timer into a work log. Returns the hours written, or null
 * when the session was too short to be worth recording.
 */
async function closeTimer(timer: {
  id: string;
  userId: string;
  ticketId: string;
  startedAt: Date;
  note: string | null;
}) {
  const elapsed = Date.now() - timer.startedAt.getTime();
  await prisma.runningTimer.delete({ where: { id: timer.id } }).catch(() => {});

  if (elapsed < MIN_TRACKED_MS) return null;

  const hours = msToHours(elapsed);
  await prisma.workLog.create({
    data: {
      ticketId: timer.ticketId,
      userId: timer.userId,
      hours,
      spentOn: new Date(),
      description: timer.note,
    },
  });

  return hours;
}

export async function startTimerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ticketId = String(formData.get("ticketId"));

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, projectId: true },
  });
  if (!ticket) return { error: "Ticket not found" };

  const user = await assertTracker(ticket.projectId);

  // Starting a second timer closes the first one instead of refusing — that's
  // what switching tasks actually means.
  const existing = await prisma.runningTimer.findUnique({
    where: { userId: user.id },
  });
  if (existing) {
    if (existing.ticketId === ticketId) return { ok: true };
    await closeTimer(existing);
    revalidatePath(`/tickets/${existing.ticketId}`);
  }

  await prisma.runningTimer.create({
    data: {
      userId: user.id,
      ticketId,
      note: String(formData.get("note") ?? "").trim() || null,
    },
  });

  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/timesheet");
  return { ok: true };
}

export async function stopTimerAction() {
  const user = await requireUser();
  const timer = await prisma.runningTimer.findUnique({
    where: { userId: user.id },
    include: { ticket: { select: { projectId: true } } },
  });
  if (!timer) return;

  const hours = await closeTimer(timer);

  if (hours) {
    await logActivity({
      type: "worklog.added",
      message: `logged ${hours}h with the timer`,
      userId: user.id,
      projectId: timer.ticket.projectId,
      ticketId: timer.ticketId,
    });

    const project = await prisma.project.findUnique({
      where: { id: timer.ticket.projectId },
    });
    if (project) await checkBudgetThreshold(project);
  }

  revalidatePath(`/tickets/${timer.ticketId}`);
  revalidatePath(`/projects/${timer.ticket.projectId}`, "layout");
  revalidatePath("/timesheet");
  revalidatePath("/dashboard");
}

export async function discardTimerAction() {
  const user = await requireUser();
  const timer = await prisma.runningTimer.findUnique({
    where: { userId: user.id },
  });
  if (!timer) return;

  await prisma.runningTimer.delete({ where: { id: timer.id } });

  revalidatePath(`/tickets/${timer.ticketId}`);
  revalidatePath("/timesheet");
}
