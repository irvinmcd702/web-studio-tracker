import type { Prisma } from "@prisma/client";

import { prisma } from "./db";
import { addDays, dayKey, weekEnd, weekStart } from "./time";

/**
 * Who is over-committed, and when.
 *
 * The weekly question a studio actually asks — "can we take this on?" — and the
 * one thing the tracker held every number for without ever adding them up.
 *
 * **The rule, stated once so nobody has to guess it:** a ticket's *remaining*
 * hours sit in the week it is due. Not spread across the weeks between now and
 * then, not smeared by some velocity — spreading would invent a schedule
 * nobody agreed to, and this view is only worth having if a person can check
 * any number in it against a ticket.
 *
 * Three things therefore refuse to become hours in a week, and are reported on
 * their own instead:
 *
 * - **Overdue** work has no future week to sit in; it should already have
 *   happened. Folding it into this week would quietly reschedule it.
 * - **Undated** work has to happen sometime but nobody has said when.
 * - **Unestimated** work is counted, never guessed. A ticket with no estimate
 *   contributes zero hours and one to a count, which is the honest answer.
 *
 * Capacity is a planning figure and nothing else: it decides when a cell is
 * shown as over-committed. Nothing is ever checked against it, and no
 * timesheet is judged by it.
 */

export type WorkloadWeek = {
  /** `YYYY-MM-DD` of the Monday. */
  start: string;
  /** Remaining hours of open tickets due in this week. */
  committed: number;
  /** Hours actually logged in this week — what happened, not what was planned. */
  logged: number;
  tickets: number;
};

export type WorkloadRow = {
  user: {
    id: string;
    name: string;
    position: string | null;
    avatarColor: string;
    role: string;
  };
  capacity: number;
  weeks: WorkloadWeek[];
  /** Open, estimated, past its date. Deliberately not inside any week. */
  overdueHours: number;
  overdueTickets: number;
  /** Open and estimated, with no date at all. */
  undatedHours: number;
  /** Open and assigned with no estimate: a count, because a guess would be a lie. */
  unestimated: number;
};

export type Workload = {
  weeks: { start: string; label: string }[];
  rows: WorkloadRow[];
  /** Open tickets nobody holds. They are somebody's week, just not yet. */
  unassigned: { hours: number; tickets: number };
};

const WEEKS = 6;

function label(start: Date) {
  const end = addDays(start, 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export async function collectWorkload({
  now = new Date(),
  weeks = WEEKS,
  scope = {},
}: {
  now?: Date;
  weeks?: number;
  scope?: Prisma.ProjectWhereInput;
} = {}): Promise<Workload> {
  const first = weekStart(now);
  const horizon = weekEnd(addDays(first, (weeks - 1) * 7));

  const windows = Array.from({ length: weeks }, (_, i) => {
    const start = addDays(first, i * 7);
    return { start, key: dayKey(start), label: label(start) };
  });

  const people = await prisma.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "MANAGER", "MEMBER"] } },
    select: {
      id: true,
      name: true,
      position: true,
      avatarColor: true,
      role: true,
      weeklyCapacity: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  // Every open ticket on a live project, with what has already been spent on
  // it — the remaining estimate is what a week is committed to, not the whole
  // estimate of something half done.
  const open = await prisma.ticket.findMany({
    where: {
      project: { AND: [scope, { status: { in: ["ACTIVE", "ON_HOLD"] } }] },
      status: { category: { not: "DONE" } },
    },
    select: {
      id: true,
      estimate: true,
      dueDate: true,
      assigneeId: true,
      workLogs: { select: { hours: true } },
    },
  });

  const perWeekLogged = await prisma.workLog.findMany({
    where: { spentOn: { gte: first, lte: horizon } },
    select: { userId: true, hours: true, spentOn: true },
  });

  const blank = (): WorkloadRow => ({
    user: { id: "", name: "", position: null, avatarColor: "", role: "" },
    capacity: 0,
    weeks: windows.map((w) => ({
      start: w.key,
      committed: 0,
      logged: 0,
      tickets: 0,
    })),
    overdueHours: 0,
    overdueTickets: 0,
    undatedHours: 0,
    unestimated: 0,
  });

  const rows = new Map<string, WorkloadRow>();
  for (const person of people) {
    const row = blank();
    row.user = {
      id: person.id,
      name: person.name,
      position: person.position,
      avatarColor: person.avatarColor,
      role: person.role,
    };
    row.capacity = person.weeklyCapacity;
    rows.set(person.id, row);
  }

  const weekIndex = (date: Date) => {
    const start = weekStart(date).getTime();
    return windows.findIndex((w) => w.start.getTime() === start);
  };

  const unassigned = { hours: 0, tickets: 0 };
  const today = weekStart(now);

  for (const ticket of open) {
    const spent = ticket.workLogs.reduce((sum, l) => sum + l.hours, 0);
    const remaining =
      ticket.estimate != null ? Math.max(0, ticket.estimate - spent) : null;

    if (!ticket.assigneeId) {
      unassigned.tickets += 1;
      unassigned.hours += remaining ?? 0;
      continue;
    }

    const row = rows.get(ticket.assigneeId);
    // An inactive or erased person still holds tickets; they are not a row.
    if (!row) continue;

    if (remaining == null) {
      row.unestimated += 1;
      continue;
    }

    if (!ticket.dueDate) {
      row.undatedHours += remaining;
      continue;
    }

    if (ticket.dueDate < today) {
      row.overdueHours += remaining;
      row.overdueTickets += 1;
      continue;
    }

    const i = weekIndex(ticket.dueDate);
    // Beyond the horizon: real work, but not this view's question.
    if (i < 0) continue;

    row.weeks[i]!.committed += remaining;
    row.weeks[i]!.tickets += 1;
  }

  for (const entry of perWeekLogged) {
    const row = rows.get(entry.userId);
    if (!row) continue;
    const i = weekIndex(entry.spentOn);
    if (i < 0) continue;
    row.weeks[i]!.logged += entry.hours;
  }

  return {
    weeks: windows.map((w) => ({ start: w.key, label: w.label })),
    rows: [...rows.values()],
    unassigned,
  };
}

/** How hard a week is pushing, as a fraction of capacity. Null when unknown. */
export function pressure(week: WorkloadWeek, capacity: number) {
  if (capacity <= 0) return null;
  return week.committed / capacity;
}

export function pressureTone(value: number | null) {
  if (value == null) return "unknown" as const;
  if (value > 1) return "over" as const;
  if (value >= 0.85) return "tight" as const;
  if (value > 0) return "fine" as const;
  return "empty" as const;
}
