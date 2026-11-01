import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure, projectScope } from "@/lib/permissions";
import {
  priorityColors,
  priorityLabels,
  projectStatusColors,
  projectStatusLabels,
} from "@/lib/labels";
import {
  formatDate,
  formatHours,
  formatRelative,
  ticketKey,
} from "@/lib/utils";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  Dot,
  EmptyState,
  PageHeader,
  Stat,
} from "@/components/ui/primitives";
import { FirstRun } from "@/components/shell/first-run";
import { AttentionCard } from "@/components/attention/attention-card";
import { collectSignals, signalsFor } from "@/lib/attention";
import { appUrl } from "@/lib/rocketchat";

export default async function DashboardPage() {
  const user = await requireStaff();
  const scope = projectScope(user);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    activeProjects,
    myOpenTickets,
    newRequests,
    monthHours,
    projects,
    activity,
  ] = await Promise.all([
    prisma.project.count({ where: { AND: [scope, { status: "ACTIVE" }] } }),
    prisma.ticket.count({
      where: {
        assigneeId: user.id,
        status: { category: { not: "DONE" } },
      },
    }),
    prisma.clientRequest.count({
      where: { status: { in: ["NEW", "IN_REVIEW"] } },
    }),
    prisma.workLog.aggregate({
      where: { userId: user.id, spentOn: { gte: startOfMonth } },
      _sum: { hours: true },
    }),
    prisma.project.findMany({
      where: { AND: [scope, { status: { in: ["ACTIVE", "ON_HOLD"] } }] },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        client: true,
        manager: true,
        _count: { select: { tickets: true } },
      },
    }),
    prisma.activity.findMany({
      where: { project: scope },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { user: true, project: true },
    }),
  ]);

  // A fresh install, not an empty week: no project exists at all, and the
  // person looking is the one who can do something about it. A developer with
  // nothing assigned yet must never be told to "add the first client".
  const setup =
    canConfigure(user) &&
    activeProjects === 0 &&
    (await prisma.project.count({ where: scope })) === 0
      ? await (async () => {
          const [workflows, people, clients] = await Promise.all([
            prisma.workflow.count({ where: { isArchived: false } }),
            prisma.user.count({
              where: {
                isActive: true,
                role: { in: ["ADMIN", "MANAGER", "MEMBER"] },
              },
            }),
            prisma.client.count({ where: { isArchived: false } }),
          ]);
          return { workflows, people, clients };
        })()
      : null;

  const myTickets = await prisma.ticket.findMany({
    where: { assigneeId: user.id, status: { category: { not: "DONE" } } },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take: 6,
    include: { project: true, status: true },
  });

  // The same rules the nightly digest runs, narrowed to this person: their own
  // deadlines, plus how their projects are doing if they run any.
  const signals = signalsFor(await collectSignals({ scope }), user);

  return (
    <>
      <PageHeader
        title={`Hi, ${user.name.split(" ")[0]}`}
        description="A snapshot of your projects and tasks"
      />

      {setup ? (
        <FirstRun
          hasWorkflow={setup.workflows > 0}
          hasPeople={setup.people > 1}
          hasClient={setup.clients > 0}
          appUrl={appUrl()}
        />
      ) : null}

      <AttentionCard signals={signals} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active projects" value={activeProjects} />
        <Stat label="My open tasks" value={myOpenTickets} />
        <Stat
          label="New requests"
          value={newRequests}
          tone={newRequests > 0 ? "warn" : "default"}
          sub={newRequests > 0 ? "Waiting for triage" : "All triaged"}
        />
        <Stat
          label="Logged this month"
          value={formatHours(monthHours._sum.hours ?? 0)}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* A grid item defaults to min-width:auto, so without this the widest
            project name sets the column width and the page scrolls sideways
            on a phone instead of the names truncating. */}
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title="Projects in flight"
              action={
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-brand)] hover:underline"
                >
                  All projects <ArrowRight size={14} />
                </Link>
              }
            />
            {projects.length === 0 ? (
              <EmptyState
                title="No active projects yet"
                description="Create one from scratch or from an incoming client request."
              />
            ) : (
              <div className="divide-y divide-[var(--color-line)]">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-[var(--color-hover)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-ink-2)]">
                          {project.key}
                        </span>
                        <span className="truncate text-sm font-medium">
                          {project.name}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-muted)]">
                        {project.client?.name ?? "Internal project"} ·{" "}
                        {project._count.tickets} tickets
                        {project.dueDate
                          ? ` · due ${formatDate(project.dueDate)}`
                          : ""}
                      </p>
                    </div>
                    <Badge color={projectStatusColors[project.status]}>
                      <Dot color={projectStatusColors[project.status]!} />
                      {projectStatusLabels[project.status]}
                    </Badge>
                    {project.manager ? (
                      <Avatar
                        name={project.manager.name}
                        color={project.manager.avatarColor}
                        size={24}
                      />
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="My tasks"
              action={
                <Link
                  href="/my-tasks"
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--color-brand)] hover:underline"
                >
                  All tasks <ArrowRight size={14} />
                </Link>
              }
            />
            {myTickets.length === 0 ? (
              <EmptyState
                icon={<Inbox size={28} />}
                title="Nothing assigned to you"
                description="You're clear. Pick something up from a project board."
              />
            ) : (
              <div className="divide-y divide-[var(--color-line)]">
                {myTickets.map((ticket) => (
                  <Link
                    key={ticket.id}
                    href={`/tickets/${ticket.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-[var(--color-hover)]"
                  >
                    <span className="font-mono text-[11.5px] text-[var(--color-muted)]">
                      {ticketKey(ticket.project.key, ticket.number)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {ticket.title}
                    </span>
                    <Badge color={priorityColors[ticket.priority]}>
                      {priorityLabels[ticket.priority]}
                    </Badge>
                    <Badge color={ticket.status.color}>
                      <Dot color={ticket.status.color} />
                      {ticket.status.name}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Recent activity" />
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
                    <p className="text-[13px] leading-snug">
                      <span className="font-medium">
                        {item.user?.name ?? "System"}
                      </span>{" "}
                      <span className="text-[var(--color-muted)]">
                        {item.message}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-[var(--color-muted)]">
                      {item.project?.key ? `${item.project.key} · ` : ""}
                      {formatRelative(item.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
