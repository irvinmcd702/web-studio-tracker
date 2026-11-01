import Link from "next/link";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import {
  priorityColors,
  priorityLabels,
  ticketTypeColors,
  ticketTypeLabels,
} from "@/lib/labels";
import { formatDate, formatHours, ticketKey } from "@/lib/utils";
import {
  Badge,
  Card,
  CardHeader,
  Dot,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const user = await requireStaff();
  const { show = "open" } = await searchParams;

  const tickets = await prisma.ticket.findMany({
    where: {
      assigneeId: user.id,
      ...(show === "open"
        ? { status: { category: { not: "DONE" } } }
        : show === "done"
          ? { status: { category: "DONE" } }
          : {}),
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { number: "desc" }],
    include: {
      project: true,
      status: true,
      workLogs: { select: { hours: true } },
    },
  });

  const reported = await prisma.ticket.count({
    where: { reporterId: user.id, status: { category: { not: "DONE" } } },
  });

  const tabs = [
    { value: "open", label: "Open" },
    { value: "done", label: "Completed" },
    { value: "all", label: "All" },
  ];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <>
      <PageHeader
        title="My tasks"
        description={`${tickets.length} assigned to you · ${reported} open task(s) you reported`}
      />

      <div className="mb-4 flex gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1 w-fit">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={`/my-tasks?show=${tab.value}`}
            className={
              show === tab.value
                ? "rounded-md bg-[var(--color-brand-soft)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-brand)]"
                : "rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink-2)] transition hover:bg-[var(--color-hover-strong)]"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Assigned to me" />
        {tickets.length === 0 ? (
          <EmptyState
            title="No tasks"
            description="Pick something up from any of your project boards."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {tickets.map((ticket) => {
              const spent = ticket.workLogs.reduce((s, w) => s + w.hours, 0);
              const overdue =
                ticket.dueDate &&
                ticket.dueDate < today &&
                ticket.status.category !== "DONE";

              return (
                <li key={ticket.id}>
                  <Link
                    href={`/tickets/${ticket.id}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-[var(--color-hover)]"
                  >
                    <span className="font-mono text-[11.5px] text-[var(--color-muted)]">
                      {ticketKey(ticket.project.key, ticket.number)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">
                        {ticket.title}
                      </p>
                      <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
                        {ticket.project.name}
                        {ticket.estimate != null
                          ? ` · estimate ${formatHours(ticket.estimate)}, logged ${formatHours(spent)}`
                          : spent > 0
                            ? ` · logged ${formatHours(spent)}`
                            : ""}
                      </p>
                    </div>
                    <Badge color={ticketTypeColors[ticket.type]}>
                      {ticketTypeLabels[ticket.type]}
                    </Badge>
                    <Badge color={priorityColors[ticket.priority]}>
                      {priorityLabels[ticket.priority]}
                    </Badge>
                    <Badge color={ticket.status.color}>
                      <Dot color={ticket.status.color} />
                      {ticket.status.name}
                    </Badge>
                    <span
                      className={
                        overdue
                          ? "w-28 text-right text-[12.5px] font-medium text-[var(--color-danger)]"
                          : "w-28 text-right text-[12.5px] text-[var(--color-muted)]"
                      }
                    >
                      {ticket.dueDate
                        ? formatDate(ticket.dueDate)
                        : "no due date"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
