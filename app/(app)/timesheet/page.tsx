import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import {
  dayKey,
  isSameDay,
  isWeekend,
  parseWeekParam,
  shortDateLabel,
  shortDayLabel,
  weekDays,
  weekEnd,
} from "@/lib/time";
import { addDays } from "@/lib/time";
import { formatHours, ticketKey } from "@/lib/utils";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { WeekGrid, type GridRow } from "@/components/timesheet/week-grid";
import {
  AddEntryForm,
  type TicketOption,
} from "@/components/timesheet/add-entry-form";

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireStaff();
  const { week } = await searchParams;

  const start = parseWeekParam(week);
  const end = weekEnd(start);
  const days = weekDays(start);
  const today = new Date();

  const [logs, assigned] = await Promise.all([
    prisma.workLog.findMany({
      where: { userId: user.id, spentOn: { gte: start, lte: end } },
      orderBy: { createdAt: "asc" },
      include: { ticket: { include: { project: true } } },
    }),
    prisma.ticket.findMany({
      where: {
        OR: [{ assigneeId: user.id }, { reporterId: user.id }],
        status: { category: { not: "DONE" } },
      },
      orderBy: { number: "desc" },
      take: 100,
      include: { project: true },
    }),
  ]);

  // Rows are the tickets touched this week, in the order they first appear.
  const rowMap = new Map<string, GridRow>();
  const counts = new Map<string, number>();

  for (const log of logs) {
    const cellKey = `${log.ticketId}:${dayKey(log.spentOn)}`;
    counts.set(cellKey, (counts.get(cellKey) ?? 0) + 1);

    let row = rowMap.get(log.ticketId);
    if (!row) {
      row = {
        ticketId: log.ticketId,
        ticketKey: ticketKey(log.ticket.project.key, log.ticket.number),
        title: log.ticket.title,
        projectName: log.ticket.project.name,
        cells: {},
      };
      rowMap.set(log.ticketId, row);
    }

    const key = dayKey(log.spentOn);
    const cell = row.cells[key];
    row.cells[key] = {
      hours: Math.round(((cell?.hours ?? 0) + log.hours) * 100) / 100,
      editable: true,
    };
  }

  // A day holding more than one entry is shown read-only: saving a single
  // number there would silently merge separate notes into one.
  for (const row of rowMap.values()) {
    for (const [key, cell] of Object.entries(row.cells)) {
      if ((counts.get(`${row.ticketId}:${key}`) ?? 0) > 1) {
        cell.editable = false;
      }
    }
  }

  const rows = [...rowMap.values()];
  const weekTotal = logs.reduce((sum, log) => sum + log.hours, 0);
  const trackedDays = new Set(logs.map((log) => dayKey(log.spentOn))).size;

  const ticketOptions: TicketOption[] = [];
  const seen = new Set<string>();
  for (const ticket of [...assigned, ...logs.map((l) => l.ticket)]) {
    if (seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    ticketOptions.push({
      id: ticket.id,
      label: `${ticketKey(ticket.project.key, ticket.number)} · ${ticket.title}`,
      projectName: ticket.project.name,
    });
  }

  const prevWeek = dayKey(addDays(start, -7));
  const nextWeek = dayKey(addDays(start, 7));
  const thisWeek = dayKey(new Date());
  const inCurrentWeek = days.some((d) => isSameDay(d, today));

  return (
    <>
      <PageHeader
        title="Timesheet"
        description={`${shortDateLabel(start)} — ${shortDateLabel(days[6]!)}`}
        action={
          <>
            <Link
              href={`/timesheet?week=${prevWeek}`}
              className={buttonClass("secondary", "sm")}
              aria-label="Previous week"
            >
              <ChevronLeft size={15} />
            </Link>
            {!inCurrentWeek ? (
              <Link
                href={`/timesheet?week=${thisWeek}`}
                className={buttonClass("secondary", "sm")}
              >
                This week
              </Link>
            ) : null}
            <Link
              href={`/timesheet?week=${nextWeek}`}
              className={buttonClass("secondary", "sm")}
              aria-label="Next week"
            >
              <ChevronRight size={15} />
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Logged this week" value={formatHours(weekTotal)} />
        <Stat
          label="Days with entries"
          value={`${trackedDays} / 7`}
          sub={trackedDays === 0 ? "Nothing logged yet" : undefined}
        />
        <Stat label="Tickets touched" value={rows.length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-4">
        <Card className="overflow-hidden xl:col-span-3">
          <CardHeader
            title="Your week"
            description="Hours you logged, editable in place"
          />
          {rows.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-[var(--color-muted)]">
              Nothing logged this week. Add an entry on the right, or start the
              timer from a ticket.
            </p>
          ) : (
            <div className="px-1 py-1">
              <WeekGrid
                rows={rows}
                days={days.map((d) => ({
                  key: dayKey(d),
                  weekday: shortDayLabel(d),
                  date: shortDateLabel(d),
                  isWeekend: isWeekend(d),
                  isToday: isSameDay(d, today),
                }))}
              />
            </div>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader title="Add an entry" />
          <div className="px-5 py-4">
            <AddEntryForm
              tickets={ticketOptions}
              defaultDay={inCurrentWeek ? dayKey(today) : dayKey(start)}
              days={days.map((d) => ({
                key: dayKey(d),
                label: `${shortDayLabel(d)}, ${shortDateLabel(d)}`,
              }))}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
