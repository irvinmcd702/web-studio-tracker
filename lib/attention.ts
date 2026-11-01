import type { Prisma } from "@prisma/client";

import { prisma } from "./db";
import { spentHoursByProject } from "./budget";
import { getStudioSettings } from "./settings";
import { formatDate, formatHours, ticketKey } from "./utils";

/**
 * What needs a person's attention today.
 *
 * Every rule here is arithmetic over dates the tracker already holds — nothing
 * is guessed and nothing is predicted. That is deliberate: a reminder people
 * can check against the ticket is a reminder they keep switched on.
 *
 * Each signal names its own audience at the moment it is produced, so the
 * dashboard and the daily digest read the same list rather than each deciding
 * separately who ought to care.
 */

export type SignalKind =
  | "ticket.overdue"
  | "ticket.due_soon"
  | "ticket.stalled"
  | "project.overdue"
  | "project.due_soon"
  | "approval.waiting"
  | "chat.unanswered"
  | "budget.pace"
  | "timer.running"
  | "mention.unread"
  | "outreach.reply_unanswered"
  | "outreach.approval_waiting";

export type Signal = {
  /** Stable across runs, so the same thing is never reported twice. */
  key: string;
  kind: SignalKind;
  severity: "high" | "medium";
  title: string;
  detail: string;
  href: string;
  projectId: string | null;
  projectKey: string | null;
  projectName: string | null;
  /**
   * What to file this under when it does not belong to a project. Without it
   * the digest groups a projectless signal under "No project", which reads
   * like a bug rather than like a heading.
   */
  groupLabel?: string;
  /** Exactly the people this is addressed to. */
  audience: string[];
  /**
   * True when the signal is about running the project rather than doing the
   * work: admins and managers see these for any project in their scope, on top
   * of whoever is named in `audience`.
   */
  managerial: boolean;
};

export type AttentionRules = {
  remindDueWithinDays: number;
  remindStalledDays: number;
  remindApprovalDays: number;
  remindClientReplyHours: number;
  remindTimerHours: number;
  remindBudgetPace: boolean;
  remindOutreachReplyHours: number;
  remindOutreachApprovalDays: number;
};

/** Projects nobody is working on right now produce no reminders. */
const LIVE: Prisma.ProjectWhereInput = {
  status: { in: ["ACTIVE", "ON_HOLD"] },
};

const DAY = 86_400_000;

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Whole days from `from` to `to`, counted by calendar day, not by hours. */
export function dayDiff(from: Date, to: Date) {
  return Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY,
  );
}

function days(count: number) {
  return count === 1 ? "1 day" : `${count} days`;
}

/**
 * Signals for every project matching `scope`. Pass a `projectScope(user)` to
 * get one person's view; pass nothing for the whole studio, which is what the
 * nightly run does.
 */
export async function collectSignals({
  now = new Date(),
  scope = {},
  rules,
}: {
  now?: Date;
  scope?: Prisma.ProjectWhereInput;
  rules?: AttentionRules;
} = {}): Promise<Signal[]> {
  const settings = rules ?? (await getStudioSettings());
  const today = startOfDay(now);
  const signals: Signal[] = [];

  // Someone has to receive a project's signals even when it has no PM.
  let adminIds: string[] | null = null;
  const admins = async () => {
    adminIds ??= (
      await prisma.user.findMany({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      })
    ).map((u) => u.id);
    return adminIds;
  };

  const projects = await prisma.project.findMany({
    where: { AND: [scope, LIVE] },
    select: {
      id: true,
      key: true,
      name: true,
      dueDate: true,
      startDate: true,
      createdAt: true,
      managerId: true,
      budgetType: true,
      budgetHours: true,
      currency: true,
      chatMessages: {
        where: { isInternal: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          createdAt: true,
          author: { select: { name: true, role: true } },
        },
      },
    },
  });

  const owners = new Map<string, string[]>();
  for (const project of projects) {
    owners.set(
      project.id,
      project.managerId ? [project.managerId] : await admins(),
    );
  }

  const ref = (project: { id: string; key: string; name: string }) => ({
    projectId: project.id,
    projectKey: project.key,
    projectName: project.name,
  });

  // --- Tickets ------------------------------------------------------------

  const dueHorizon =
    settings.remindDueWithinDays > 0
      ? new Date(today.getTime() + settings.remindDueWithinDays * DAY + DAY - 1)
      : null;

  const dated = await prisma.ticket.findMany({
    where: {
      project: { AND: [scope, LIVE] },
      status: { category: { not: "DONE" } },
      dueDate: { not: null, lt: dueHorizon ?? today },
    },
    select: {
      id: true,
      number: true,
      title: true,
      dueDate: true,
      assigneeId: true,
      project: { select: { id: true, key: true, name: true } },
    },
  });

  for (const ticket of dated) {
    const due = ticket.dueDate!;
    const late = dayDiff(due, today);
    const audience = ticket.assigneeId
      ? [ticket.assigneeId]
      : (owners.get(ticket.project.id) ?? []);

    if (late > 0) {
      signals.push({
        key: `ticket.overdue:${ticket.id}`,
        kind: "ticket.overdue",
        severity: "high",
        title: `${ticketKey(ticket.project.key, ticket.number)} · ${ticket.title}`,
        detail: `Due ${formatDate(due)} — ${days(late)} late${
          ticket.assigneeId ? "" : ", and nobody is assigned"
        }`,
        href: `/tickets/${ticket.id}`,
        ...ref(ticket.project),
        audience,
        managerial: true,
      });
    } else if (settings.remindDueWithinDays > 0) {
      const left = dayDiff(today, due);
      signals.push({
        key: `ticket.due_soon:${ticket.id}`,
        kind: "ticket.due_soon",
        severity: "medium",
        title: `${ticketKey(ticket.project.key, ticket.number)} · ${ticket.title}`,
        detail: left === 0 ? "Due today" : `Due in ${days(left)}`,
        href: `/tickets/${ticket.id}`,
        ...ref(ticket.project),
        audience,
        managerial: false,
      });
    }
  }

  // Started and then left alone: in progress, untouched, and no time logged
  // since. Both halves matter — a ticket moved this morning is not stalled,
  // and one being worked on daily is not either.
  if (settings.remindStalledDays > 0) {
    const cutoff = new Date(now.getTime() - settings.remindStalledDays * DAY);

    const stalled = await prisma.ticket.findMany({
      where: {
        project: { AND: [scope, LIVE] },
        status: { category: "IN_PROGRESS" },
        updatedAt: { lt: cutoff },
        workLogs: { none: { spentOn: { gte: cutoff } } },
      },
      select: {
        id: true,
        number: true,
        title: true,
        updatedAt: true,
        assigneeId: true,
        status: { select: { name: true } },
        project: { select: { id: true, key: true, name: true } },
      },
    });

    for (const ticket of stalled) {
      signals.push({
        key: `ticket.stalled:${ticket.id}`,
        kind: "ticket.stalled",
        severity: "medium",
        title: `${ticketKey(ticket.project.key, ticket.number)} · ${ticket.title}`,
        detail: `In ${ticket.status.name} for ${days(
          Math.max(1, dayDiff(ticket.updatedAt, now)),
        )} with no time logged`,
        href: `/tickets/${ticket.id}`,
        ...ref(ticket.project),
        audience: ticket.assigneeId
          ? [ticket.assigneeId]
          : (owners.get(ticket.project.id) ?? []),
        managerial: true,
      });
    }
  }

  // --- Projects -----------------------------------------------------------

  const spent = await spentHoursByProject(projects.map((p) => p.id));

  for (const project of projects) {
    const audience = owners.get(project.id) ?? [];

    if (project.dueDate) {
      const late = dayDiff(project.dueDate, today);
      if (late > 0) {
        signals.push({
          key: `project.overdue:${project.id}`,
          kind: "project.overdue",
          severity: "high",
          title: `${project.key} · ${project.name}`,
          detail: `Deadline was ${formatDate(project.dueDate)} — ${days(late)} ago`,
          href: `/projects/${project.id}`,
          ...ref(project),
          audience,
          managerial: true,
        });
      } else if (
        settings.remindDueWithinDays > 0 &&
        -late <= settings.remindDueWithinDays
      ) {
        signals.push({
          key: `project.due_soon:${project.id}`,
          kind: "project.due_soon",
          severity: "medium",
          title: `${project.key} · ${project.name}`,
          detail: -late === 0 ? "Deadline today" : `Deadline in ${days(-late)}`,
          href: `/projects/${project.id}`,
          ...ref(project),
          audience,
          managerial: true,
        });
      }
    }

    // The client wrote last and nobody has answered. The single most
    // embarrassing thing a studio can let happen quietly.
    const last = project.chatMessages[0];
    if (
      settings.remindClientReplyHours > 0 &&
      last &&
      last.author.role === "CLIENT" &&
      now.getTime() - last.createdAt.getTime() >=
        settings.remindClientReplyHours * 3_600_000
    ) {
      const hours = Math.floor(
        (now.getTime() - last.createdAt.getTime()) / 3_600_000,
      );
      signals.push({
        key: `chat.unanswered:${last.id}`,
        kind: "chat.unanswered",
        severity: "high",
        title: `${project.key} · ${project.name}`,
        detail: `${last.author.name} wrote ${hours}h ago and nobody has replied`,
        href: `/projects/${project.id}/chat`,
        ...ref(project),
        audience,
        managerial: true,
      });
    }

    // Burn rate against the deadline. Only for hourly work with both a budget
    // and a date — without either there is nothing to compare.
    if (
      settings.remindBudgetPace &&
      project.budgetType === "HOURLY" &&
      project.budgetHours &&
      project.budgetHours > 0 &&
      project.dueDate &&
      project.dueDate > now
    ) {
      const used = spent.get(project.id) ?? 0;
      const elapsed = Math.max(
        1,
        dayDiff(project.startDate ?? project.createdAt, now),
      );
      const remaining = Math.max(1, dayDiff(now, project.dueDate));
      const perDay = used / elapsed;
      const projected = used + perDay * remaining;

      // Under budget today, over it by the deadline. Being already over is a
      // different fact with its own loud alert, and repeating it here would
      // only bury this one.
      if (used < project.budgetHours && projected > project.budgetHours) {
        const daysToExhaust = Math.floor(
          (project.budgetHours - used) / Math.max(perDay, 0.0001),
        );
        const outOn = new Date(now.getTime() + daysToExhaust * DAY);
        signals.push({
          key: `budget.pace:${project.id}`,
          kind: "budget.pace",
          severity: "medium",
          title: `${project.key} · ${project.name}`,
          detail: `${formatHours(used)} of ${formatHours(
            project.budgetHours,
          )} used. At this rate the budget runs out around ${formatDate(
            outOn,
          )}, before the ${formatDate(project.dueDate)} deadline`,
          href: `/projects/${project.id}/budget`,
          ...ref(project),
          audience,
          managerial: true,
        });
      }
    }
  }

  // --- Approvals ----------------------------------------------------------

  if (settings.remindApprovalDays > 0) {
    const cutoff = new Date(now.getTime() - settings.remindApprovalDays * DAY);

    const waiting = await prisma.approval.findMany({
      where: {
        project: { AND: [scope, LIVE] },
        status: "PENDING",
        OR: [{ requestedAt: { lt: cutoff } }, { dueDate: { lt: today } }],
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        requestedAt: true,
        createdAt: true,
        project: { select: { id: true, key: true, name: true } },
      },
    });

    for (const approval of waiting) {
      const since = approval.requestedAt ?? approval.createdAt;
      const overdue = approval.dueDate ? approval.dueDate < today : false;
      signals.push({
        key: `approval.waiting:${approval.id}`,
        kind: "approval.waiting",
        severity: overdue ? "high" : "medium",
        title: `${approval.project.key} · ${approval.title}`,
        detail: overdue
          ? `The client was asked to respond by ${formatDate(approval.dueDate)}`
          : `Waiting on the client for ${days(Math.max(1, dayDiff(since, now)))}`,
        href: `/projects/${approval.project.id}/approvals`,
        ...ref(approval.project),
        audience: owners.get(approval.project.id) ?? [],
        managerial: true,
      });
    }
  }

  // --- Timers -------------------------------------------------------------

  // A stopwatch nobody stopped turns into hours nobody worked, and those hours
  // reach a client's invoice. Worth a nudge to the one person who can fix it.
  if (settings.remindTimerHours > 0) {
    const cutoff = new Date(
      now.getTime() - settings.remindTimerHours * 3_600_000,
    );

    const running = await prisma.runningTimer.findMany({
      where: {
        startedAt: { lt: cutoff },
        ticket: { project: { AND: [scope, LIVE] } },
      },
      select: {
        id: true,
        userId: true,
        startedAt: true,
        ticket: {
          select: {
            id: true,
            number: true,
            title: true,
            project: { select: { id: true, key: true, name: true } },
          },
        },
      },
    });

    for (const timer of running) {
      const hours = Math.floor(
        (now.getTime() - timer.startedAt.getTime()) / 3_600_000,
      );
      signals.push({
        key: `timer.running:${timer.id}`,
        kind: "timer.running",
        severity: "medium",
        title: `${ticketKey(
          timer.ticket.project.key,
          timer.ticket.number,
        )} · ${timer.ticket.title}`,
        detail: `Your timer has been running for ${hours}h — stop it, or the logged hours will be wrong`,
        href: `/tickets/${timer.ticket.id}`,
        ...ref(timer.ticket.project),
        audience: [timer.userId],
        managerial: false,
      });
    }
  }

  // --- Mentions -----------------------------------------------------------

  // Somebody asked this person a question by name. It is already scoped: a
  // mention only exists for somebody who could see the thing.
  const mentions = await prisma.mention.findMany({
    where: {
      readAt: null,
      OR: [{ project: { is: scope } }, { projectId: null }],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      excerpt: true,
      createdAt: true,
      userId: true,
      author: { select: { name: true } },
      project: { select: { id: true, key: true, name: true } },
      ticket: { select: { id: true, number: true } },
    },
  });

  for (const mention of mentions) {
    const key = mention.ticket
      ? ticketKey(mention.project?.key ?? "?", mention.ticket.number)
      : (mention.project?.name ?? "a message");

    signals.push({
      key: `mention.unread:${mention.id}`,
      kind: "mention.unread",
      severity: "high",
      title: `${mention.author?.name ?? "Someone"} mentioned you in ${key}`,
      detail: mention.excerpt,
      href: mention.ticket
        ? `/tickets/${mention.ticket.id}`
        : `/projects/${mention.project?.id}/chat`,
      projectId: mention.project?.id ?? null,
      projectKey: mention.project?.key ?? null,
      projectName: mention.project?.name ?? null,
      audience: [mention.userId],
      // Being named is between two people. It is not the PM's queue.
      managerial: false,
    });
  }

  // --- Outreach ------------------------------------------------------------
  //
  // Two rules, and only two. A message going out is not news; a person writing
  // back to a machine and nobody coming is the one outreach failure that costs
  // something, and a first message nobody has read is a queue that has quietly
  // stopped.
  //
  // Neither belongs to a project, so both carry `groupLabel` — without it the
  // digest files them under "No project", which reads like a bug.
  if (settings.remindOutreachReplyHours > 0) {
    const replies = await prisma.outreachMessage.findMany({
      where: {
        direction: "IN",
        createdAt: {
          lt: new Date(
            now.getTime() - settings.remindOutreachReplyHours * 3_600_000,
          ),
        },
        lead: { status: "REPLIED" },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        subject: true,
        createdAt: true,
        lead: { select: { id: true, name: true, email: true, ownerId: true } },
      },
    });

    for (const reply of replies) {
      if (!reply.lead) continue;
      const who = reply.lead.name ?? reply.lead.email;
      const hours = Math.floor(
        (now.getTime() - reply.createdAt.getTime()) / 3_600_000,
      );

      signals.push({
        key: `outreach.reply_unanswered:${reply.id}`,
        kind: "outreach.reply_unanswered",
        severity: "high",
        title: `${who} replied ${hours} hours ago`,
        detail: reply.subject,
        href: `/outreach/leads/${reply.lead.id}`,
        projectId: null,
        projectKey: null,
        projectName: null,
        groupLabel: "Outreach",
        audience: reply.lead.ownerId ? [reply.lead.ownerId] : [],
        // Nobody may own the lead, and somebody still has to answer.
        managerial: true,
      });
    }
  }

  if (settings.remindOutreachApprovalDays > 0) {
    // A filtered relation count rather than a groupBy: it comes back with the
    // campaign's name attached, which is what the sentence needs.
    const stale = {
      status: "AWAITING_APPROVAL" as const,
      createdAt: {
        lt: new Date(now.getTime() - settings.remindOutreachApprovalDays * DAY),
      },
    };

    const waiting = await prisma.campaign.findMany({
      where: { enrolments: { some: stale } },
      select: {
        id: true,
        name: true,
        _count: { select: { enrolments: { where: stale } } },
      },
    });

    for (const row of waiting) {
      signals.push({
        key: `outreach.approval_waiting:${row.id}`,
        kind: "outreach.approval_waiting",
        severity: "medium",
        title: `${row._count.enrolments} first messages nobody has read in ${row.name}`,
        detail: `Waiting more than ${settings.remindOutreachApprovalDays} days. Nothing sends until somebody reads them.`,
        href: `/outreach/campaigns/${row.id}`,
        projectId: null,
        projectKey: null,
        projectName: null,
        groupLabel: "Outreach",
        audience: [],
        managerial: true,
      });
    }
  }

  return sortSignals(signals);
}

/**
 * Every kind, in the order they are worth reading.
 *
 * Typed as a full record rather than an array of kinds on purpose. The array
 * version ranked with `indexOf`, which returns **-1 for anything not listed** —
 * so a newly added kind sorted ahead of everything, including overdue tickets,
 * and nothing would have told you. As a `Record<SignalKind, number>` the
 * compiler refuses to build until a new kind has been given a place.
 */
const KIND_ORDER: Record<SignalKind, number> = {
  "mention.unread": 0,
  "chat.unanswered": 1,
  "outreach.reply_unanswered": 2,
  "approval.waiting": 3,
  "project.overdue": 4,
  "ticket.overdue": 5,
  "budget.pace": 6,
  "ticket.stalled": 7,
  "outreach.approval_waiting": 8,
  "timer.running": 9,
  "project.due_soon": 10,
  "ticket.due_soon": 11,
};

export function sortSignals(signals: Signal[]) {
  return [...signals].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === "high" ? -1 : 1;
    const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (byKind !== 0) return byKind;
    return a.title.localeCompare(b.title);
  });
}

/**
 * The subset one person should be shown: everything addressed to them, plus
 * the running-the-project signals when they are the kind of person who runs
 * projects. Scope is already applied by the query above.
 */
export function signalsFor(
  signals: Signal[],
  user: { id: string; role: string },
) {
  const managerial = user.role === "ADMIN" || user.role === "MANAGER";
  return signals.filter(
    (signal) =>
      signal.audience.includes(user.id) || (managerial && signal.managerial),
  );
}
