"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { findTransition, isTransitionAllowed } from "@/lib/workflow";
import {
  checkConditions,
  hasHooks,
  parseConditions,
  parseHooks,
} from "@/lib/workflow-rules";
import { runTransitionHooks } from "@/lib/workflow-hooks";
import { checkBudgetThreshold } from "@/lib/budget";
import {
  TicketOpError,
  commentOnTicket,
  insertTicket,
  logWork,
  moveTicket,
} from "@/lib/ticket-ops";
import { notifyTicketAssigned, notifyTicketStatusChanged } from "@/lib/notify";
import { ticketKey } from "@/lib/utils";
import type { ActionState } from "@/components/ui/form";

async function assertTicketEditor(projectId: string) {
  const user = await requireUser();
  if (!canEditProject(user))
    throw new Error("You don't have permission to do that");
  if (!(await canAccessProject(user, projectId))) {
    throw new Error("Project is not accessible");
  }
  return user;
}

function optionalNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function optionalDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return raw ? new Date(raw) : null;
}

const ticketSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().max(8000).optional().nullable(),
  acceptance: z.string().max(4000).optional().nullable(),
  type: z.enum(["TASK", "BUG", "FEATURE", "CHORE"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
});

export async function createTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId"));
  const user = await assertTicketEditor(projectId);

  const parsed = ticketSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    acceptance: String(formData.get("acceptance") ?? "").trim() || null,
    type: String(formData.get("type") ?? "TASK"),
    priority: String(formData.get("priority") ?? "MEDIUM"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      workflow: { include: { statuses: { orderBy: { position: "asc" } } } },
    },
  });
  if (!project) return { error: "Project not found" };

  const requestedStatusId = String(formData.get("statusId") ?? "");
  const status =
    project.workflow.statuses.find((s) => s.id === requestedStatusId) ??
    project.workflow.statuses.find((s) => s.isInitial) ??
    project.workflow.statuses[0];

  if (!status) {
    return { error: "The project workflow has no statuses — add at least one" };
  }

  // Numbering lives in one place — see `insertTicket` for why it has to.
  const ticket = await insertTicket({
    projectId,
    statusId: status.id,
    title: parsed.data.title,
    description: parsed.data.description,
    acceptance: parsed.data.acceptance,
    type: parsed.data.type,
    priority: parsed.data.priority,
    estimate: optionalNumber(formData.get("estimate")),
    dueDate: optionalDate(formData.get("dueDate")),
    assigneeId: String(formData.get("assigneeId") ?? "") || null,
    reporterId: user.id,
    isClientVisible: formData.get("isClientVisible") === "on",
  });

  await logActivity({
    type: "ticket.created",
    message: `created ${ticketKey(project.key, ticket.number)}: ${ticket.title}`,
    userId: user.id,
    projectId,
    ticketId: ticket.id,
  });

  if (ticket.assigneeId) {
    const assignee = await prisma.user.findUnique({
      where: { id: ticket.assigneeId },
      select: { name: true },
    });
    if (assignee) {
      await notifyTicketAssigned({
        project,
        ticketId: ticket.id,
        number: ticket.number,
        title: ticket.title,
        assigneeName: assignee.name,
        actorName: user.name,
        priority: ticket.priority,
        dueDate: ticket.dueDate,
      });
    }
  }

  revalidatePath(`/projects/${projectId}`, "layout");
  return { ok: true };
}

export async function updateTicketAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const existing = await prisma.ticket.findUnique({
    where: { id },
    include: { project: true, status: true },
  });
  if (!existing) return { error: "Ticket not found" };

  const user = await assertTicketEditor(existing.projectId);

  const parsed = ticketSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    acceptance: String(formData.get("acceptance") ?? "").trim() || null,
    type: String(formData.get("type") ?? "TASK"),
    priority: String(formData.get("priority") ?? "MEDIUM"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const assigneeId = String(formData.get("assigneeId") ?? "") || null;

  const updated = await prisma.ticket.update({
    where: { id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      acceptance: parsed.data.acceptance,
      type: parsed.data.type,
      priority: parsed.data.priority,
      estimate: optionalNumber(formData.get("estimate")),
      dueDate: optionalDate(formData.get("dueDate")),
      assigneeId,
      isClientVisible: formData.get("isClientVisible") === "on",
    },
  });

  await logActivity({
    type: "ticket.updated",
    message: "updated the ticket",
    userId: user.id,
    projectId: existing.projectId,
    ticketId: id,
  });

  // Only ping when the assignee actually changed to somebody new.
  if (assigneeId && assigneeId !== existing.assigneeId) {
    const assignee = await prisma.user.findUnique({
      where: { id: assigneeId },
      select: { name: true },
    });
    if (assignee) {
      await notifyTicketAssigned({
        project: existing.project,
        ticketId: id,
        number: updated.number,
        title: updated.title,
        assigneeName: assignee.name,
        actorName: user.name,
        priority: updated.priority,
        dueDate: updated.dueDate,
      });
    }
  }

  revalidatePath(`/tickets/${id}`);
  revalidatePath(`/projects/${existing.projectId}`, "layout");
  return { ok: true };
}

export async function moveTicketAction(formData: FormData) {
  const id = String(formData.get("id"));
  const toStatusId = String(formData.get("statusId"));
  const user = await requireUser();

  const { projectId } = await moveTicket({
    ticketId: id,
    toStatusId,
    actor: user,
  });

  revalidatePath(`/tickets/${id}`);
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/my-tasks");
}

/**
 * Board drag-and-drop entry point: returns the error instead of throwing so the
 * client can roll the card back to its original column.
 */
export async function moveTicketTo(
  ticketId: string,
  statusId: string,
): Promise<{ error?: string }> {
  try {
    const formData = new FormData();
    formData.set("id", ticketId);
    formData.set("statusId", statusId);
    await moveTicketAction(formData);
    return {};
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Couldn't move the ticket",
    };
  }
}

/**
 * Ticket-page variant. A transition can now be refused by its conditions,
 * which is an ordinary outcome rather than a crash — so the reason is returned
 * for the form to display instead of thrown at the error boundary.
 */
export async function moveTicketFeedbackAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await moveTicketAction(formData);
    return { ok: true };
  } catch (e) {
    // A redirect throws by design and must be allowed to propagate.
    if (e && typeof e === "object" && "digest" in e) throw e;
    return {
      error: e instanceof Error ? e.message : "Couldn't move the ticket",
    };
  }
}

export async function deleteTicketAction(formData: FormData) {
  const id = String(formData.get("id"));
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) return;

  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    throw new Error("Only an administrator or manager can delete tickets");
  }

  await prisma.ticket.delete({ where: { id } });
  revalidatePath(`/projects/${ticket.projectId}`, "layout");
  redirect(`/projects/${ticket.projectId}/board`);
}

// --- comments --------------------------------------------------------------

export async function addCommentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const ticketId = String(formData.get("ticketId"));

  try {
    await commentOnTicket({
      ticketId,
      body: String(formData.get("body") ?? ""),
      actor: user,
    });
    revalidatePath(`/tickets/${ticketId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof TicketOpError) return { error: e.message };
    throw e;
  }
}

export async function deleteCommentAction(formData: FormData) {
  const id = String(formData.get("id"));
  const comment = await prisma.ticketComment.findUnique({ where: { id } });
  if (!comment) return;

  const user = await requireUser();
  if (comment.authorId !== user.id && user.role !== "ADMIN") {
    throw new Error("You can only delete your own comments");
  }

  await prisma.ticketComment.delete({ where: { id } });
  revalidatePath(`/tickets/${comment.ticketId}`);
}

// --- work logs -------------------------------------------------------------

export async function addWorkLogAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const ticketId = String(formData.get("ticketId"));

  try {
    const { projectId } = await logWork({
      ticketId,
      hours: optionalNumber(formData.get("hours")) ?? 0,
      spentOn: optionalDate(formData.get("spentOn")),
      description: String(formData.get("description") ?? ""),
      actor: user,
    });

    revalidatePath(`/tickets/${ticketId}`);
    revalidatePath(`/projects/${projectId}`, "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof TicketOpError) return { error: e.message };
    throw e;
  }
}

export async function deleteWorkLogAction(formData: FormData) {
  const id = String(formData.get("id"));
  const log = await prisma.workLog.findUnique({
    where: { id },
    include: { ticket: true },
  });
  if (!log) return;

  const user = await requireUser();
  if (
    log.userId !== user.id &&
    user.role !== "ADMIN" &&
    user.role !== "MANAGER"
  ) {
    throw new Error("You can only delete your own time entries");
  }

  await prisma.workLog.delete({ where: { id } });
  revalidatePath(`/tickets/${log.ticketId}`);
  revalidatePath(`/projects/${log.ticket.projectId}`, "layout");
}
