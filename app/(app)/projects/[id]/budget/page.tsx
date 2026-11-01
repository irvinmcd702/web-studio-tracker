import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { projectBudget } from "@/lib/budget";
import { getStudioSettings } from "@/lib/settings";
import { budgetTypeLabels } from "@/lib/labels";
import { formatDate, formatHours, formatMoney, ticketKey } from "@/lib/utils";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  Stat,
} from "@/components/ui/primitives";
import { BudgetBar } from "@/components/project/budget-bar";

export default async function ProjectBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  if (!(await canAccessProject(user, id))) notFound();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const [budget, logs, studio] = await Promise.all([
    projectBudget(project),
    prisma.workLog.findMany({
      where: { ticket: { projectId: id } },
      orderBy: { spentOn: "desc" },
      include: { user: true, ticket: true },
    }),
    getStudioSettings(),
  ]);

  // Agent time is always recorded; showing it separately is a studio choice.
  const showAgentHours = studio.agentHoursVisible && budget.agentHours > 0;

  const byPerson = new Map<
    string,
    { name: string; color: string; hours: number }
  >();
  for (const log of logs) {
    const entry = byPerson.get(log.userId);
    if (entry) entry.hours += log.hours;
    else
      byPerson.set(log.userId, {
        name: log.user.name,
        color: log.user.avatarColor,
        hours: log.hours,
      });
  }

  const byTicket = new Map<
    string,
    { key: string; title: string; hours: number; estimate: number | null }
  >();
  for (const log of logs) {
    const entry = byTicket.get(log.ticketId);
    if (entry) entry.hours += log.hours;
    else
      byTicket.set(log.ticketId, {
        key: ticketKey(project.key, log.ticket.number),
        title: log.ticket.title,
        hours: log.hours,
        estimate: log.ticket.estimate,
      });
  }

  const people = [...byPerson.entries()].sort(
    (a, b) => b[1].hours - a[1].hours,
  );
  const tickets = [...byTicket.entries()].sort(
    (a, b) => b[1].hours - a[1].hours,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Budget type"
          value={budgetTypeLabels[project.budgetType]}
          sub={
            project.budgetType === "HOURLY"
              ? `${formatMoney(project.hourlyRate, project.currency)}/h`
              : "Fixed price"
          }
        />
        <Stat
          label="Hours logged"
          value={formatHours(budget.spentHours)}
          tone={budget.isOverBudget ? "danger" : "default"}
          sub={
            showAgentHours
              ? `${formatHours(budget.agentHours)} of it with an agent`
              : budget.budgetHours
                ? `of ${formatHours(budget.budgetHours)}`
                : "no cap set"
          }
        />
        <Stat
          label="Estimated in tickets"
          value={formatHours(budget.estimatedHours)}
          sub={
            budget.budgetHours
              ? budget.estimatedHours > budget.budgetHours
                ? "estimates exceed the budget"
                : "within budget"
              : undefined
          }
        />
        <Stat
          label={
            project.budgetType === "FIXED" ? "Contract amount" : "Billed so far"
          }
          value={formatMoney(
            project.budgetType === "FIXED"
              ? budget.contractAmount
              : budget.spentAmount,
            project.currency,
          )}
          sub={
            project.budgetType === "HOURLY" && budget.contractAmount
              ? `cap ${formatMoney(budget.contractAmount, project.currency)}`
              : undefined
          }
        />
      </div>

      {project.budgetType === "HOURLY" ? (
        <Card className="px-5 py-4">
          <BudgetBar
            spent={budget.spentHours}
            total={budget.budgetHours}
            caption={
              budget.budgetHours
                ? `${budget.usedPercent}% of the budget used · ${formatHours(
                    Math.max(budget.remainingHours ?? 0, 0),
                  )} left`
                : "No hour budget set — add one in the project settings"
            }
          />
          {canEditProject(user) ? (
            <Link
              href={`/projects/${id}/settings`}
              className="mt-3 inline-block text-[13px] font-medium text-[var(--color-brand)] hover:underline"
            >
              Edit the budget →
            </Link>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="By person" />
          {people.length === 0 ? (
            <EmptyState title="No time logged yet" />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {people.map(([userId, person]) => (
                <li key={userId} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={person.name} color={person.color} size={28} />
                  <span className="flex-1 text-[13.5px]">{person.name}</span>
                  <span className="text-[13.5px] font-medium">
                    {formatHours(person.hours)}
                  </span>
                  {project.hourlyRate ? (
                    <span className="w-28 text-right text-[12.5px] text-[var(--color-muted)]">
                      {formatMoney(
                        person.hours * project.hourlyRate,
                        project.currency,
                      )}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="By ticket" />
          {tickets.length === 0 ? (
            <EmptyState title="No time logged yet" />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {tickets.map(([ticketId, item]) => (
                <li
                  key={ticketId}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <Link
                    href={`/tickets/${ticketId}`}
                    className="min-w-0 flex-1"
                  >
                    <span className="font-mono text-[11.5px] text-[var(--color-muted)]">
                      {item.key}
                    </span>
                    <p className="truncate text-[13.5px]">{item.title}</p>
                  </Link>
                  <span
                    className={
                      item.estimate != null && item.hours > item.estimate
                        ? "text-[13.5px] font-medium text-[var(--color-danger)]"
                        : "text-[13.5px] font-medium"
                    }
                  >
                    {formatHours(item.hours)}
                  </span>
                  <span className="w-20 text-right text-[12.5px] text-[var(--color-muted)]">
                    est. {formatHours(item.estimate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="All time entries"
          description={`${logs.length} entries`}
        />
        {logs.length === 0 ? (
          <EmptyState
            title="No time entries"
            description="Time is logged from a ticket page."
          />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="table-base min-w-[700px]">
              <thead>
                <tr>
                  <th className="w-32">Date</th>
                  <th className="w-52">Person</th>
                  <th>Ticket</th>
                  <th>Note</th>
                  <th className="w-24 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-[13px]">{formatDate(log.spentOn)}</td>
                    <td>
                      <span className="flex items-center gap-2 text-[13px]">
                        <Avatar
                          name={log.user.name}
                          color={log.user.avatarColor}
                          size={20}
                        />
                        {log.user.name}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/tickets/${log.ticketId}`}
                        className="text-[13px] hover:underline"
                      >
                        <span className="font-mono text-[11.5px] text-[var(--color-muted)]">
                          {ticketKey(project.key, log.ticket.number)}
                        </span>{" "}
                        {log.ticket.title}
                      </Link>
                    </td>
                    <td className="text-[13px] text-[var(--color-muted)]">
                      {log.description ?? "—"}
                    </td>
                    <td className="text-right text-[13px] font-medium">
                      {formatHours(log.hours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
