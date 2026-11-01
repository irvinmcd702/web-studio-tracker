import { prisma } from "./db";
import { ticketKey } from "./utils";
import { branchNameFor } from "./git-events";
import { allowedTargets } from "./workflow";
import { describeConditions, parseConditions } from "./workflow-rules";

/**
 * How a ticket looks to a machine.
 *
 * Two decisions worth keeping: the ticket is addressed by its human key
 * (`ACME-14`), the same string people paste into chat, and the detail view
 * carries the transitions that are actually legal from here, with the reason
 * each one is gated. An agent that can read the rules doesn't have to guess
 * and then fail.
 */

export function ticketSummary(t: {
  id: string;
  number: number;
  title: string;
  type: string;
  priority: string;
  estimate: number | null;
  dueDate: Date | null;
  isClientVisible: boolean;
  updatedAt: Date;
  project: { key: string; name: string };
  status: { name: string; category: string };
  assignee?: { name: string; email: string } | null;
}) {
  return {
    key: ticketKey(t.project.key, t.number),
    id: t.id,
    title: t.title,
    type: t.type,
    priority: t.priority,
    status: t.status.name,
    statusCategory: t.status.category,
    project: { key: t.project.key, name: t.project.name },
    assignee: t.assignee
      ? { name: t.assignee.name, email: t.assignee.email }
      : null,
    estimateHours: t.estimate,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    visibleToClient: t.isClientVisible,
    updatedAt: t.updatedAt.toISOString(),
  };
}

/** Parses "ACME-14" into the pieces needed to find the ticket. */
export function parseTicketKey(raw: string) {
  const match = /^([a-z][a-z0-9]*)-(\d+)$/i.exec(
    decodeURIComponent(raw).trim(),
  );
  if (!match) return null;
  return { projectKey: match[1]!, number: Number(match[2]) };
}

export async function ticketDetail(ticketId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      project: {
        include: {
          workflow: { include: { statuses: { orderBy: { position: "asc" } } } },
        },
      },
      status: true,
      assignee: true,
      reporter: true,
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { name: true } } },
      },
      workLogs: {
        orderBy: { spentOn: "desc" },
        include: { user: { select: { name: true } } },
      },
      _count: { select: { attachments: true } },
    },
  });
  if (!ticket) return null;

  const targets = await allowedTargets(
    ticket.project.workflowId,
    ticket.statusId,
  );

  const transitions = await Promise.all(
    targets.map(async (status) => {
      const transition = await prisma.workflowTransition.findFirst({
        where: {
          workflowId: ticket.project.workflowId,
          toStatusId: status.id,
          OR: [{ fromStatusId: ticket.statusId }, { fromStatusId: null }],
        },
        orderBy: { fromStatusId: "desc" },
      });

      return {
        to: status.name,
        statusId: status.id,
        name: transition?.name ?? null,
        requires: transition
          ? describeConditions(parseConditions(transition.conditions))
          : [],
      };
    }),
  );

  const spent = ticket.workLogs.reduce((sum, w) => sum + w.hours, 0);

  return {
    ...ticketSummary(ticket),
    description: ticket.description,
    // The branch convention that makes git report back to this ticket.
    suggestedBranch: branchNameFor(
      ticketKey(ticket.project.key, ticket.number),
      ticket.title,
    ),
    acceptance: ticket.acceptance,
    reporter: ticket.reporter
      ? { name: ticket.reporter.name, email: ticket.reporter.email }
      : null,
    loggedHours: spent,
    attachments: ticket._count.attachments,
    comments: ticket.comments.map((c) => ({
      author: c.author.name,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
    workLogs: ticket.workLogs.map((w) => ({
      person: w.user.name,
      hours: w.hours,
      source: w.source,
      spentOn: w.spentOn.toISOString().slice(0, 10),
      note: w.description,
    })),
    availableTransitions: transitions,
  };
}
