import { prisma } from "./db";
import { dayKeyToDate } from "./time";

/**
 * Reconciling one timesheet cell with the work logs behind it.
 *
 * Extracted from the server action so the rule that actually matters — a day
 * holding several entries is never silently merged into one — can be tested
 * without a browser session.
 */
export type CellOutcome =
  | "created"
  | "updated"
  | "deleted"
  | "unchanged"
  /** Several entries that day: refuse rather than destroy their notes. */
  | "conflict";

/**
 * The name a timesheet cell carries in the form, built in one place.
 *
 * The grid wrote this literally and the action kept its own copy of the
 * prefix. They agreed, so nothing was broken — but if they ever stopped
 * agreeing, every cell would be skipped and Save would still say it saved.
 * Hours quietly not recorded are hours quietly not invoiced.
 */
export const CELL_PREFIX = "cell:";

export function cellName(ticketId: string, day: string) {
  return `${CELL_PREFIX}${ticketId}:${day}`;
}

/** The ticket and day a cell name refers to, or null if it is not one. */
export function readCellName(name: string) {
  if (!name.startsWith(CELL_PREFIX)) return null;
  const [, ticketId, day] = name.split(":");
  return ticketId && day ? { ticketId, day } : null;
}

export function parseCellHours(raw: string): number | null {
  const cleaned = raw.trim().replace(",", ".");
  if (!cleaned) return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  // Snap to whole minutes so the grid and the timer agree.
  return Math.round(value * 60) / 60;
}

export function dayBounds(day: string) {
  const spentOn = dayKeyToDate(day);
  const start = new Date(spentOn);
  start.setHours(0, 0, 0, 0);
  const end = new Date(spentOn);
  end.setHours(23, 59, 59, 999);
  return { spentOn, start, end };
}

export async function setCellHours(input: {
  userId: string;
  ticketId: string;
  day: string;
  hours: number;
}): Promise<CellOutcome> {
  const { spentOn, start, end } = dayBounds(input.day);

  const existing = await prisma.workLog.findMany({
    where: {
      ticketId: input.ticketId,
      userId: input.userId,
      spentOn: { gte: start, lte: end },
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing.length > 1) return "conflict";

  const current = existing[0];
  const unchanged = current
    ? Math.abs(current.hours - input.hours) < 0.001
    : input.hours === 0;
  if (unchanged) return "unchanged";

  if (input.hours === 0 && current) {
    await prisma.workLog.delete({ where: { id: current.id } });
    return "deleted";
  }

  if (current) {
    await prisma.workLog.update({
      where: { id: current.id },
      data: { hours: input.hours },
    });
    return "updated";
  }

  await prisma.workLog.create({
    data: {
      ticketId: input.ticketId,
      userId: input.userId,
      hours: input.hours,
      spentOn,
    },
  });
  return "created";
}
