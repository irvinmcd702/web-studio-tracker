import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, MessageSquare } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { projectBudget } from "@/lib/budget";
import { budgetTypeLabels, categoryLabels } from "@/lib/labels";
import {
  formatDate,
  formatHours,
  formatMoney,
  formatRelative,
  ticketKey,
} from "@/lib/utils";
import { formatBytes } from "@/lib/storage";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  Dot,
  EmptyState,
  Stat,
} from "@/components/ui/primitives";
import { BudgetBar } from "@/components/project/budget-bar";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  if (!(await canAccessProject(user, id))) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      workflow: { include: { statuses: { orderBy: { position: "asc" } } } },
      members: {
        include: {
          user: { include: { teamMemberships: { include: { team: true } } } },
        },
        orderBy: { addedAt: "asc" },
      },
    },
  });
  if (!project) notFound();

  const [budget, ticketsByStatus, activity, files, lastMessages] =
    await Promise.all([
      projectBudget(project),
      prisma.ticket.groupBy({
        by: ["statusId"],
        where: { projectId: id },
        _count: { _all: true },
      }),
      prisma.activity.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { user: true },
      }),
      prisma.attachment.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { uploadedBy: true },
      }),
      prisma.chatMessage.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { author: true },
      }),
    ]);

  const countByStatus = new Map(
    ticketsByStatus.map((row) => [row.statusId, row._count._all]),
  );
  const totalTickets = ticketsByStatus.reduce(
    (sum, r) => sum + r._count._all,
    0,
  );
  const doneTickets = project.workflow.statuses
    .filter((s) => s.category === "DONE")
    .reduce((sum, s) => sum + (countByStatus.get(s.id) ?? 0), 0);

  // What to show under a name: their role on this project if someone set one,
  // otherwise their job title, otherwise the teams they sit in.
  const people = project.members.map((member) => ({
    id: member.id,
    name: member.user.name,
    color: member.user.avatarColor,
    caption:
      member.role ??
      member.user.position ??
      member.user.teamMemberships.map((m) => m.team.name).join(", "),
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Tickets"
            value={totalTickets}
            sub={`${doneTickets} done`}
          />
          <Stat
            label="Hours logged"
            value={formatHours(budget.spentHours)}
            sub={
              budget.budgetHours
                ? `of ${formatHours(budget.budgetHours)}`
                : budgetTypeLabels[project.budgetType]
            }
            tone={budget.isOverBudget ? "danger" : "default"}
          />
          <Stat
            label={
              project.budgetType === "FIXED"
                ? "Contract amount"
                : "Billed so far"
            }
            value={formatMoney(
              project.budgetType === "FIXED"
                ? budget.contractAmount
                : budget.spentAmount,
              project.currency,
            )}
            sub={budgetTypeLabels[project.budgetType]}
          />
        </div>

        {project.description ? (
          <Card>
            <CardHeader title="Description" />
            <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed">
              {project.description}
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Tickets by status"
            action={
              <Link
                href={`/projects/${id}/board`}
                className="text-[13px] font-medium text-[var(--color-brand)] hover:underline"
              >
                Open the board
              </Link>
            }
          />
          {project.workflow.statuses.length === 0 ? (
            <EmptyState
              title="This workflow has no statuses"
              description="Add statuses in the workflow settings."
            />
          ) : (
            <div className="space-y-3 px-5 py-4">
              {project.workflow.statuses.map((status) => {
                const count = countByStatus.get(status.id) ?? 0;
                const percent = totalTickets
                  ? Math.round((count / totalTickets) * 100)
                  : 0;
                return (
                  <div key={status.id}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span className="inline-flex items-center gap-2">
                        <Dot color={status.color} />
                        {status.name}
                        <span className="text-[11.5px] text-[var(--color-muted)]">
                          {categoryLabels[status.category]}
                        </span>
                      </span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: status.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Activity" />
          {activity.length === 0 ? (
            <EmptyState title="Nothing here yet" />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {activity.map((item) => (
                <li key={item.id} className="flex gap-3 px-5 py-3">
                  {item.user ? (
                    <Avatar
                      name={item.user.name}
                      color={item.user.avatarColor}
                      size={24}
                    />
                  ) : (
                    <span className="h-[26px] w-[26px] rounded-full bg-[var(--color-line)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">
                      <span className="font-medium">
                        {item.user?.name ?? "System"}
                      </span>{" "}
                      <span className="text-[var(--color-muted)]">
                        {item.message}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-[var(--color-muted)]">
                      {formatRelative(item.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title="Budget" />
          <div className="space-y-3 px-5 py-4">
            {project.budgetType === "HOURLY" ? (
              <>
                <BudgetBar
                  spent={budget.spentHours}
                  total={budget.budgetHours}
                  caption={
                    budget.budgetHours
                      ? `${formatHours(budget.spentHours)} of ${formatHours(budget.budgetHours)} · ${budget.usedPercent}%`
                      : `${formatHours(budget.spentHours)} logged, no cap set`
                  }
                />
                <dl className="space-y-1.5 text-[13px]">
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted)]">
                      Ticket estimates
                    </dt>
                    <dd>{formatHours(budget.estimatedHours)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted)]">Rate</dt>
                    <dd>
                      {formatMoney(project.hourlyRate, project.currency)}/h
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted)]">Billed</dt>
                    <dd className="font-medium">
                      {formatMoney(budget.spentAmount, project.currency)}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted)]">Contract amount</dt>
                  <dd className="font-medium">
                    {formatMoney(project.fixedAmount, project.currency)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted)]">Hours logged</dt>
                  <dd>{formatHours(budget.spentHours)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted)]">
                    Ticket estimates
                  </dt>
                  <dd>{formatHours(budget.estimatedHours)}</dd>
                </div>
              </dl>
            )}
            <Link
              href={`/projects/${id}/budget`}
              className="block text-[13px] font-medium text-[var(--color-brand)] hover:underline"
            >
              Breakdown by person and ticket →
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Crew"
            description={`${people.length} people on this project`}
          />
          {people.length === 0 ? (
            <EmptyState
              title="Nobody on the crew yet"
              description="Pick who works on this project in its settings."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {people.map((person) => (
                <li
                  key={person.id}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <Avatar name={person.name} color={person.color} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">
                      {person.name}
                    </p>
                    <p className="truncate text-[12px] text-[var(--color-muted)]">
                      {person.caption}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Files"
            action={
              <Link
                href={`/projects/${id}/files`}
                className="text-[13px] font-medium text-[var(--color-brand)] hover:underline"
              >
                All
              </Link>
            }
          />
          {files.length === 0 ? (
            <EmptyState icon={<FileText size={26} />} title="No files" />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {files.map((file) => (
                <li key={file.id} className="px-5 py-2.5">
                  <a
                    href={`/api/files/${file.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[13px] font-medium hover:text-[var(--color-brand)] hover:underline"
                  >
                    {file.originalName}
                  </a>
                  <p className="text-[11.5px] text-[var(--color-muted)]">
                    {formatBytes(file.size)} · {file.uploadedBy.name} ·{" "}
                    {formatDate(file.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Client chat"
            action={
              <Link
                href={`/projects/${id}/chat`}
                className="text-[13px] font-medium text-[var(--color-brand)] hover:underline"
              >
                Open
              </Link>
            }
          />
          {lastMessages.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={26} />}
              title="No messages yet"
            />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {lastMessages.reverse().map((message) => (
                <li key={message.id} className="flex gap-3 px-5 py-3">
                  <Avatar
                    name={message.author.name}
                    color={message.author.avatarColor}
                    size={24}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[12.5px] font-medium">
                      {message.author.name}
                      {message.isInternal ? (
                        <Badge color="#d97706">internal</Badge>
                      ) : null}
                    </p>
                    <p className="line-clamp-2 text-[13px] text-[var(--color-muted)]">
                      {message.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
