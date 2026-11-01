import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { canConfigure, projectScope } from "@/lib/permissions";
import { collectWorkload, pressure, pressureTone } from "@/lib/workload";
import { formatHours } from "@/lib/utils";
import {
  Avatar,
  Card,
  CardHeader,
  PageHeader,
} from "@/components/ui/primitives";

/**
 * Who is over-committed, and when.
 *
 * Managers and administrators only — not because the numbers are secret, but
 * because they are only true across the whole studio. A member's project scope
 * would give them a row for a colleague built from the third of that
 * colleague's work they happen to share, which is worse than no row at all.
 */
export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  over: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
  tight: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
  fine: "bg-[var(--color-surface-3)] text-[var(--color-ink-2)]",
  empty: "text-[var(--color-faint)]",
  unknown: "text-[var(--color-muted)]",
};

export default async function WorkloadPage() {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const workload = await collectWorkload({ scope: projectScope(user) });

  return (
    <>
      <PageHeader
        title="Workload"
        description="Remaining hours per person, in the week each ticket is due"
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="table-base">
            <thead>
              <tr>
                <th className="min-w-[180px]">Person</th>
                {workload.weeks.map((week, i) => (
                  <th key={week.start} className="text-right whitespace-nowrap">
                    {i === 0 ? "This week" : week.label}
                  </th>
                ))}
                <th className="text-right whitespace-nowrap">Overdue</th>
                <th className="text-right whitespace-nowrap">No date</th>
                <th className="text-right whitespace-nowrap">No estimate</th>
              </tr>
            </thead>
            <tbody>
              {workload.rows.map((row) => (
                <tr key={row.user.id}>
                  <td>
                    <span className="flex items-center gap-2.5">
                      <Avatar
                        name={row.user.name}
                        color={row.user.avatarColor}
                        size={26}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">
                          {row.user.name}
                        </span>
                        <span className="block truncate text-[11.5px] text-[var(--color-muted)]">
                          {row.user.position ?? "—"} · {row.capacity}h/week
                        </span>
                      </span>
                    </span>
                  </td>

                  {row.weeks.map((week) => {
                    const tone = pressureTone(pressure(week, row.capacity));
                    return (
                      <td key={week.start} className="text-right">
                        <span
                          className={`num inline-block rounded px-1.5 py-0.5 text-[13px] font-medium ${TONE[tone]}`}
                          title={
                            week.logged > 0
                              ? `${formatHours(week.logged)} logged so far`
                              : undefined
                          }
                        >
                          {week.committed > 0
                            ? formatHours(week.committed)
                            : "·"}
                        </span>
                      </td>
                    );
                  })}

                  <td className="num text-right text-[13px]">
                    {row.overdueHours > 0 ? (
                      <span className="font-medium text-[var(--color-danger)]">
                        {formatHours(row.overdueHours)}
                      </span>
                    ) : (
                      <span className="text-[var(--color-faint)]">·</span>
                    )}
                  </td>
                  <td className="num text-right text-[13px] text-[var(--color-muted)]">
                    {row.undatedHours > 0 ? formatHours(row.undatedHours) : "·"}
                  </td>
                  <td className="num text-right text-[13px] text-[var(--color-muted)]">
                    {row.unestimated > 0 ? row.unestimated : "·"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="h-fit">
          <CardHeader title="How to read this" />
          <div className="space-y-2.5 px-5 py-4 text-[13px] leading-relaxed text-[var(--color-muted)]">
            <p>
              A ticket&rsquo;s <span className="font-medium">remaining</span>{" "}
              hours — its estimate less what has already been logged — sit in
              the week it is due. Nothing is spread across weeks: that would
              invent a schedule nobody agreed to, and every figure here should
              be checkable against a ticket.
            </p>
            <p>
              <span className="font-medium text-[var(--color-ink)]">
                Overdue
              </span>{" "}
              work is kept out of the weeks on purpose. It should already have
              happened, and dropping it into this week would quietly reschedule
              it on somebody&rsquo;s behalf.
            </p>
            <p>
              <span className="font-medium text-[var(--color-ink)]">
                No estimate
              </span>{" "}
              is a count of tickets, never hours. A guess here would be a number
              that looks like the others and means nothing.
            </p>
            <p>
              Capacity comes from each person&rsquo;s profile and only decides
              when a cell turns amber or red. Nothing is measured against it.
            </p>
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Not on anyone yet"
            description="Open work with no assignee — somebody's week, just not decided"
          />
          <div className="px-5 py-4">
            {workload.unassigned.tickets === 0 ? (
              <p className="text-[13px] text-[var(--color-muted)]">
                Everything open has somebody holding it.
              </p>
            ) : (
              <p className="text-[13.5px]">
                <span className="num font-semibold">
                  {workload.unassigned.tickets}
                </span>{" "}
                {workload.unassigned.tickets === 1 ? "ticket" : "tickets"},{" "}
                <span className="num font-semibold">
                  {formatHours(workload.unassigned.hours)}
                </span>{" "}
                estimated between them.
              </p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
