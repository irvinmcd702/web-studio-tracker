"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { saveTimesheetAction } from "@/app/actions/timesheet";
import { FormError, SubmitButton } from "@/components/ui/form";
import { cn, formatHours } from "@/lib/utils";
import { cellName } from "@/lib/timesheet";

export type GridDay = {
  key: string;
  weekday: string;
  date: string;
  isWeekend: boolean;
  isToday: boolean;
};

export type GridCell = {
  hours: number;
  /** False when several entries share the day — editing would merge them. */
  editable: boolean;
};

export type GridRow = {
  ticketId: string;
  ticketKey: string;
  title: string;
  projectName: string;
  cells: Record<string, GridCell>;
};

export function WeekGrid({ days, rows }: { days: GridDay[]; rows: GridRow[] }) {
  const [state, action] = useActionState(saveTimesheetAction, null);
  const router = useRouter();

  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) {
      for (const day of days) {
        const cell = row.cells[day.key];
        map[`${row.ticketId}:${day.key}`] = cell?.hours
          ? String(cell.hours)
          : "";
      }
    }
    return map;
  }, [rows, days]);

  const [values, setValues] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setValues(initial);
  }

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const parse = (raw: string) => {
    const n = Number(raw.trim().replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const dayTotal = (dayKey: string) =>
    rows.reduce((sum, row) => {
      const cell = row.cells[dayKey];
      if (cell && !cell.editable) return sum + cell.hours;
      return sum + parse(values[`${row.ticketId}:${dayKey}`] ?? "");
    }, 0);

  const rowTotal = (row: GridRow) =>
    days.reduce((sum, day) => {
      const cell = row.cells[day.key];
      if (cell && !cell.editable) return sum + cell.hours;
      return sum + parse(values[`${row.ticketId}:${day.key}`] ?? "");
    }, 0);

  const weekTotal = days.reduce((sum, day) => sum + dayTotal(day.key), 0);
  const dirty = Object.keys(values).some((k) => values[k] !== initial[k]);

  return (
    <form action={action} className="space-y-3">
      <FormError message={state?.error} />

      <div className="overflow-x-auto scroll-thin">
        <table className="table-base min-w-[860px]">
          <thead>
            <tr>
              <th className="w-[38%]">Ticket</th>
              {days.map((day) => (
                <th
                  key={day.key}
                  className={cn(
                    "w-[8%] text-center",
                    day.isWeekend && "bg-[var(--color-surface-2)]",
                    day.isToday && "text-[var(--color-brand)]",
                  )}
                >
                  {day.weekday}
                  <span className="block text-[11px] font-normal normal-case">
                    {day.date}
                  </span>
                </th>
              ))}
              <th className="w-[9%] text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.ticketId}>
                <td>
                  <Link href={`/tickets/${row.ticketId}`} className="block">
                    <span className="font-mono text-[11.5px] text-[var(--color-muted)]">
                      {row.ticketKey}
                    </span>
                    <span className="ml-1.5 text-[13.5px] hover:underline">
                      {row.title}
                    </span>
                    <span className="block text-[12px] text-[var(--color-muted)]">
                      {row.projectName}
                    </span>
                  </Link>
                </td>

                {days.map((day) => {
                  const cell = row.cells[day.key];
                  const name = cellName(row.ticketId, day.key);

                  if (cell && !cell.editable) {
                    return (
                      <td
                        key={day.key}
                        className={cn(
                          "text-center",
                          day.isWeekend && "bg-[var(--color-surface-2)]",
                        )}
                        title="Several entries that day — edit them on the ticket"
                      >
                        <span className="text-[13px] text-[var(--color-muted)] underline decoration-dotted">
                          {cell.hours}
                        </span>
                      </td>
                    );
                  }

                  return (
                    <td
                      key={day.key}
                      className={cn(
                        "p-1 text-center",
                        day.isWeekend && "bg-[var(--color-surface-2)]",
                      )}
                    >
                      <input
                        name={name}
                        inputMode="decimal"
                        // A grid of forty identical boxes is unusable without
                        // this: the column heading and the row are what say
                        // which cell you are in, and neither reaches a control
                        // that has no name of its own.
                        aria-label={`Hours on ${row.ticketKey}, ${day.weekday} ${day.date}`}
                        value={values[`${row.ticketId}:${day.key}`] ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({
                            ...v,
                            [`${row.ticketId}:${day.key}`]: e.target.value,
                          }))
                        }
                        placeholder="—"
                        className="h-9 w-full rounded-md border border-transparent bg-transparent text-center text-[13px] outline-none transition hover:border-[var(--color-line)] focus:border-[var(--color-brand)] focus:bg-[var(--color-surface)] focus:ring-2"
                      />
                    </td>
                  );
                })}

                <td className="text-right text-[13px] font-medium">
                  {formatHours(rowTotal(row))}
                </td>
              </tr>
            ))}

            <tr className="bg-[var(--color-surface-2)]/70">
              <td className="text-[13px] font-semibold">Daily total</td>
              {days.map((day) => {
                const total = dayTotal(day.key);
                return (
                  <td
                    key={day.key}
                    className={cn(
                      "text-center text-[13px] font-medium",
                      day.isWeekend && "bg-[var(--color-surface-3)]/60",
                      total > 12 && "text-[var(--color-danger)]",
                    )}
                  >
                    {total ? formatHours(total) : "—"}
                  </td>
                );
              })}
              <td className="text-right text-[13.5px] font-semibold">
                {formatHours(weekTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[var(--color-muted)]">
          Type hours into a cell — 1.5 means an hour and a half. Empty clears
          the entry. Dotted figures hold several entries and are edited on the
          ticket.
        </p>
        <span className="flex items-center gap-3">
          {dirty ? (
            <span className="text-[12px] font-medium text-[var(--color-warn)]">
              Unsaved changes
            </span>
          ) : null}
          <SubmitButton size="sm">Save week</SubmitButton>
        </span>
      </div>
    </form>
  );
}
