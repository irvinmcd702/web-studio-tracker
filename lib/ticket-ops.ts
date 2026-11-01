import type { WorkSource } from "@prisma/client";

import { prisma } from "./db";
import { recordMentions } from "./mentions";
import type { SessionUser } from "./auth";
import { canAccessProject, canEditProject } from "./permissions";
import { logActivity } from "./activity";
import { findTransition, isTransitionAllowed } from "./workflow";
import {
  checkConditions,
  hasHooks,
  parseConditions,
  parseHooks,
} from "./workflow-rules";
import { runTransitionHooks } from "./workflow-hooks";
import { checkBudgetThreshold } from "./budget";
import { notifyTicketStatusChanged } from "./notify";

/**
 * The three things anyone does to a ticket, with the actor passed in rather
 * than read from the session.
 *
 * A form and an API token now go through exactly the same code: the same
 * permission check, the same workflow conditions, the same hooks, the same
 * activity trail. An agent cannot take a shortcut a person doesn't have.
 */

export class TicketOpError extends Error {}

async function assertEditor(actor: SessionUser, projectId: string) {
  if (!canEditProject(actor)) {
    throw new TicketOpError("You don't have permission to do that");
  }
  if (!(await canAccessProject(actor, projectId))) {
    throw new TicketOpError("Project is not accessible");
  }
}

export async function moveTicket({
  ticketId,
  toStatusId,
  actor,
}: {
  ticketId: string;
  toStatusId: string;
  actor: SessionUser;
}) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      project: true,
      status: true,
      _count: { select: { comments: true } },
    },
  });
  if (!ticket) throw new TicketOpError("Ticket not found");

  await assertEditor(actor, ticket.projectId);

  const allowed = await isTransitionAllowed(
    ticket.project.workflowId,
    ticket.statusId,
    toStatusId,
  );
  if (!allowed) {
    throw new TicketOpError(
      "The project workflow doesn't allow this transition",
    );
  }

  const target = await prisma.workflowStatus.findUnique({
    where: { id: toStatusId },
  });
  if (!target || target.workflowId !== ticket.project.workflowId) {
    throw new TicketOpError(
      "That status doesn't belong to the project workflow",
    );
  }

  // Conditions live on the arrow, so they are enforced here rather than in the
  // board UI — dragging a card is not the only way to reach this code.
  const transition =
    ticket.statusId === toStatusId
      ? null
      : await findTransition(
          ticket.project.workflowId,
          ticket.statusId,
          toStatusId,
        );

  if (transition) {
    const conditions = parseConditions(transition.conditions);

    // Only asked for when an arrow actually cares about the past — most do
    // not, and this is a second query.
    const visitedStatusIds = conditions.requireVisitedStatusId
      ? (
          await prisma.ticketStatusChange.findMany({
            where: { ticketId },
            select: { toStatusId: true },
            distinct: ["toStatusId"],
          })
        ).map((c) => c.toStatusId)
      : [];

    const blocked = checkConditions(conditions, {
      actor: { id: actor.id, role: actor.role },
      ticket: {
        assigneeId: ticket.assigneeId,
        estimate: ticket.estimate,
        description: ticket.description,
        acceptance: ticket.acceptance,
        commentCount: ticket._count.comments,
        visitedStatusIds,
      },
    });

    if (blocked) {
      // The rules file knows ids; this one knows names, so when it is the
      // history condition that refused, the sentence names the step rather
      // than printing a cuid at somebody.
      const waitingFor = conditions.requireVisitedStatusId;
      if (waitingFor && !visitedStatusIds.includes(waitingFor)) {
        const step = await prisma.workflowStatus.findUnique({
          where: { id: waitingFor },
          select: { name: true },
        });
        if (step) {
          throw new TicketOpError(
            `This move is only open once the ticket has been through ${step.name}`,
          );
        }
      }
      throw new TicketOpError(blocked);
    }
  }

  const last = await prisma.ticket.findFirst({
    where: { projectId: ticket.projectId, statusId: toStatusId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { statusId: toStatusId, position: (last?.position ?? 0) + 1000 },
  });

  // The feed narrates the move for a person; this records it for a condition.
  await prisma.ticketStatusChange.create({
    data: {
      ticketId,
      fromStatusId: ticket.statusId,
      toStatusId: target.id,
      toStatusName: target.name,
      userId: actor.id,
    },
  });

  await logActivity({
    type: "ticket.status_changed",
    message: `moved the ticket: ${ticket.status.name} → ${target.name}`,
    userId: actor.id,
    projectId: ticket.projectId,
    ticketId,
  });

  await notifyTicketStatusChanged({
    project: ticket.project,
    ticketId,
    number: ticket.number,
    title: ticket.title,
    from: ticket.status.name,
    to: target.name,
    actorName: actor.name,
  });

  // Hooks run last: the move already succeeded, so a failing hook is reported
  // rather than rolled back.
  if (transition) {
    const hooks = parseHooks(transition.hooks);
    if (hasHooks(hooks)) {
      const outcomes = await runTransitionHooks(hooks, {
        ticketId,
        ticketNumber: ticket.number,
        ticketTitle: ticket.title,
        project: ticket.project,
        fromStatus: ticket.status.name,
        toStatus: target.name,
        actor: { id: actor.id, name: actor.name },
      });

      const failed = outcomes.filter((o) => !o.ok);
      if (failed.length) {
        await logActivity({
          type: "transition.hook_failed",
          message: `automation partly failed: ${failed
            .map((f) => `${f.hook} (${f.error})`)
            .join(", ")}`,
          userId: actor.id,
          projectId: ticket.projectId,
          ticketId,
        });
      }
    }
  }

  return {
    projectId: ticket.projectId,
    from: ticket.status.name,
    to: target.name,
  };
}

export async function commentOnTicket({
  ticketId,
  body,
  actor,
}: {
  ticketId: string;
  body: string;
  actor: SessionUser;
}) {
  const trimmed = body.trim();
  if (!trimmed) throw new TicketOpError("Comment is empty");

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new TicketOpError("Ticket not found");

  await assertEditor(actor, ticket.projectId);

  const comment = await prisma.ticketComment.create({
    data: { ticketId, authorId: actor.id, body: trimmed },
  });

  // Here rather than in the action, so a comment posted through the API or by
  // an agent notifies the same people a comment typed in the browser does.
  const mentioned = await recordMentions({
    body: trimmed,
    projectId: ticket.projectId,
    ticketId,
    authorId: actor.id,
  });

  return { comment, projectId: ticket.projectId, mentioned };
}

export async function logWork({
  ticketId,
  hours,
  spentOn,
  description,
  actor,
  source = "HUMAN",
}: {
  ticketId: string;
  hours: number;
  spentOn?: Date | null;
  description?: string | null;
  actor: SessionUser;
  source?: WorkSource;
}) {
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new TicketOpError("Enter the number of hours");
  }
  if (hours > 24) {
    throw new TicketOpError("A single entry can't exceed 24 hours");
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { project: true },
  });
  if (!ticket) throw new TicketOpError("Ticket not found");

  await assertEditor(actor, ticket.projectId);

  const entry = await prisma.workLog.create({
    data: {
      ticketId,
      userId: actor.id,
      hours,
      spentOn: spentOn ?? new Date(),
      description: description?.trim() || null,
      source,
    },
  });

  await logActivity({
    type: "worklog.added",
    message:
      source === "AGENT"
        ? `logged ${hours}h of agent work`
        : `logged ${hours}h`,
    userId: actor.id,
    projectId: ticket.projectId,
    ticketId,
  });

  await checkBudgetThreshold(ticket.project);

  return { entry, projectId: ticket.projectId };
}

/**
 * A new ticket, numbered.
 *
 * The counter and the row have to move inside one transaction or two tickets
 * created at the same moment can claim the same number — which is the sort of
 * thing that shows up as a duplicate key in the middle of a busy afternoon.
 * That is the whole reason this lives here rather than being written out
 * again wherever a ticket is made.
 *
 * Everything above it — validation, notifications, whether the caller is
 * allowed — belongs to the caller. This only makes the row.
 */
export async function insertTicket({
  projectId,
  statusId,
  title,
  description = null,
  acceptance = null,
  type = "TASK",
  priority = "MEDIUM",
  estimate = null,
  dueDate = null,
  assigneeId = null,
  reporterId = null,
  meetingId = null,
  isClientVisible = false,
}: {
  projectId: string;
  statusId: string;
  title: string;
  description?: string | null;
  acceptance?: string | null;
  type?: "TASK" | "BUG" | "FEATURE" | "CHORE";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  estimate?: number | null;
  dueDate?: Date | null;
  assigneeId?: string | null;
  reporterId?: string | null;
  meetingId?: string | null;
  isClientVisible?: boolean;
}) {
  const last = await prisma.ticket.findFirst({
    where: { projectId, statusId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { ticketCounter: { increment: 1 } },
      select: { ticketCounter: true },
    });

    return tx.ticket.create({
      data: {
        projectId,
        number: updated.ticketCounter,
        title,
        description,
        acceptance,
        type,
        priority,
        statusId,
        position: (last?.position ?? 0) + 1000,
        estimate,
        dueDate,
        assigneeId,
        reporterId,
        meetingId,
        isClientVisible,
      },
    });
  });
}
