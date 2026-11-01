import { prisma } from "./db";
import { pickPortalValues } from "./portal";

/**
 * The shapes a studio builds over and over.
 *
 * A template is made by **saving a project that went well**, not by filling in
 * a blank form. A studio's best template is a job it has already done, and the
 * tickets it actually needed are already sitting there.
 *
 * What a template deliberately does *not* carry:
 *
 * - **Assignees.** Work goes to whoever is on the new crew. A template that
 *   hands a ticket to somebody who has since left, or who is not on this
 *   project at all, is a template people learn to distrust.
 * - **Statuses.** Everything starts where the workflow says it starts.
 *   Pre-placing work in QA would be describing progress that has not happened.
 * - **Dates**, as dates. A due date is stored as "so many days after the
 *   project starts", and only when the source project had a start date to
 *   measure from. Otherwise it is null, because a template cannot invent one.
 * - Hours, comments, files, chat: those belong to the job that was done.
 */

const DAY = 86_400_000;

/** Whole days between two dates, never negative. */
function daysBetween(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY));
}

export async function createTemplateFromProject({
  projectId,
  name,
  description,
  authorId,
}: {
  projectId: string;
  name: string;
  description?: string | null;
  authorId: string;
}) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tickets: {
        // Finished work is not part of the shape of a new project; what the
        // job needed is, and that is every ticket that was ever raised.
        orderBy: [{ position: "asc" }, { number: "asc" }],
      },
    },
  });
  if (!project) return { ok: false as const, error: "Project not found" };

  const start = project.startDate;

  return {
    ok: true as const,
    template: await prisma.projectTemplate.create({
      data: {
        name,
        description: description?.trim() || null,
        workflowId: project.workflowId,
        budgetType: project.budgetType,
        budgetHours: project.budgetHours,
        hourlyRate: project.hourlyRate,
        fixedAmount: project.fixedAmount,
        currency: project.currency,
        ...pickPortalValues(project),
        createdById: authorId,
        items: {
          create: project.tickets.map((ticket, i) => ({
            position: i,
            title: ticket.title,
            description: ticket.description,
            acceptance: ticket.acceptance,
            type: ticket.type,
            priority: ticket.priority,
            estimate: ticket.estimate,
            dueAfterDays:
              start && ticket.dueDate
                ? daysBetween(start, ticket.dueDate)
                : null,
            isClientVisible: ticket.isClientVisible,
          })),
        },
      },
      include: { items: true },
    }),
  };
}

/**
 * Fills a freshly created project with the template's tickets.
 *
 * Called after the project exists, so it inherits the project's own workflow
 * rather than the template's — whoever created it may have chosen a different
 * one, and the form they just filled in wins over the shape they started from.
 */
export async function applyTemplateToProject({
  templateId,
  projectId,
}: {
  templateId: string;
  projectId: string;
}) {
  const [template, project] = await Promise.all([
    prisma.projectTemplate.findUnique({
      where: { id: templateId },
      include: { items: { orderBy: { position: "asc" } } },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      include: { workflow: { include: { statuses: true } } },
    }),
  ]);

  if (!template || !project) return { created: 0 };

  const initial =
    project.workflow.statuses.find((s) => s.isInitial) ??
    project.workflow.statuses.sort((a, b) => a.position - b.position)[0];
  if (!initial) return { created: 0 };

  const start = project.startDate;
  const existing = await prisma.ticket.count({ where: { projectId } });

  await prisma.$transaction([
    prisma.ticket.createMany({
      data: template.items.map((item, i) => ({
        projectId,
        statusId: initial.id,
        number: existing + i + 1,
        position: i,
        title: item.title,
        description: item.description,
        acceptance: item.acceptance,
        type: item.type,
        priority: item.priority,
        estimate: item.estimate,
        // Only when both halves are known. A template with a relative date and
        // a project with no start date produce no date at all, not today's.
        dueDate:
          start && item.dueAfterDays != null
            ? new Date(start.getTime() + item.dueAfterDays * DAY)
            : null,
        isClientVisible: item.isClientVisible,
      })),
    }),
    // The project's own counter has to move with them, or the next ticket
    // created by hand collides on `@@unique([projectId, number])`.
    prisma.project.update({
      where: { id: projectId },
      data: { ticketCounter: existing + template.items.length },
    }),
  ]);

  return { created: template.items.length };
}

/** What the template list needs to show, in one query. */
export async function listTemplates() {
  return prisma.projectTemplate.findMany({
    where: { isArchived: false },
    orderBy: { name: "asc" },
    include: {
      workflow: { select: { name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
}

/** Total estimated hours in a template, or null when nothing is estimated. */
export function templateHours(items: { estimate: number | null }[]) {
  const estimated = items.filter((i) => i.estimate != null);
  if (!estimated.length) return null;
  return estimated.reduce((sum, i) => sum + (i.estimate ?? 0), 0);
}
