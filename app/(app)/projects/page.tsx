import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canEditProject, projectScope } from "@/lib/permissions";
import { spentHoursByProject } from "@/lib/budget";
import {
  budgetTypeLabels,
  projectStatusColors,
  projectStatusLabels,
} from "@/lib/labels";
import { formatDate, formatHours, formatMoney } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import {
  Avatar,
  Badge,
  Card,
  Dot,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { BudgetBar } from "@/components/project/budget-bar";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Drafts" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requireStaff();
  const { status = "", q = "" } = await searchParams;

  const projects = await prisma.project.findMany({
    where: {
      AND: [
        projectScope(user),
        status ? { status: status as never } : {},
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { key: { contains: q, mode: "insensitive" as const } },
                {
                  client: {
                    name: { contains: q, mode: "insensitive" as const },
                  },
                },
              ],
            }
          : {},
      ],
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      client: true,
      manager: true,
      workflow: true,
      members: { include: { user: true }, orderBy: { addedAt: "asc" } },
      _count: { select: { tickets: true } },
    },
  });

  const spent = await spentHoursByProject(projects.map((p) => p.id));

  return (
    <>
      <PageHeader
        title="Projects"
        description={`${projects.length} project(s)`}
        action={
          canEditProject(user) ? (
            <Link href="/projects/new" className={buttonClass("primary", "md")}>
              <Plus size={16} />
              New project
            </Link>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1">
          {STATUS_TABS.map((tab) => {
            const active = status === tab.value;
            const params = new URLSearchParams();
            if (tab.value) params.set("status", tab.value);
            if (q) params.set("q", q);
            return (
              <Link
                key={tab.value || "all"}
                href={`/projects${params.toString() ? `?${params}` : ""}`}
                className={
                  active
                    ? "rounded-md bg-[var(--color-brand-soft)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-brand)]"
                    : "rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink-2)] transition hover:bg-[var(--color-hover-strong)]"
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <form className="relative ml-auto" action="/projects">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-faint)]"
          />
          <input
            name="q"
            defaultValue={q}
            aria-label="Search projects"
            placeholder="Search by name, key or client"
            className="field w-full pl-9 sm:w-72"
          />
        </form>
      </div>

      <Card className="overflow-hidden">
        {projects.length === 0 ? (
          <EmptyState
            title="No projects found"
            description="Adjust the filters or create a new project."
            action={
              canEditProject(user) ? (
                <Link
                  href="/projects/new"
                  className={buttonClass("primary", "sm")}
                >
                  <Plus size={15} />
                  New project
                </Link>
              ) : null
            }
          />
        ) : (
          <div className="hidden overflow-x-auto scroll-thin md:block">
            <table className="table-base min-w-[900px]">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Crew</th>
                  <th>Budget</th>
                  <th>Status</th>
                  <th>PM</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const spentHours = spent.get(project.id) ?? 0;
                  return (
                    <tr
                      key={project.id}
                      className="transition hover:bg-[var(--color-hover)]"
                    >
                      <td>
                        <Link
                          href={`/projects/${project.id}`}
                          className="block"
                        >
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-ink-2)]">
                              {project.key}
                            </span>
                            <span className="font-medium">{project.name}</span>
                          </div>
                          <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
                            {project._count.tickets} tickets ·{" "}
                            {project.workflow.name}
                            {project.dueDate
                              ? ` · due ${formatDate(project.dueDate)}`
                              : ""}
                          </p>
                        </Link>
                      </td>
                      <td className="text-[13px]">
                        {project.client?.name ?? (
                          <span className="text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          {project.members.length === 0 ? (
                            <span className="text-[13px] text-[var(--color-muted)]">
                              —
                            </span>
                          ) : (
                            <>
                              {project.members.slice(0, 5).map((member) => (
                                <Avatar
                                  key={member.id}
                                  name={member.user.name}
                                  color={member.user.avatarColor}
                                  size={24}
                                  title={
                                    member.role
                                      ? `${member.user.name} — ${member.role}`
                                      : member.user.name
                                  }
                                />
                              ))}
                              {project.members.length > 5 ? (
                                <span className="text-[12px] text-[var(--color-muted)]">
                                  +{project.members.length - 5}
                                </span>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="w-52">
                        {project.budgetType === "HOURLY" ? (
                          <BudgetBar
                            spent={spentHours}
                            total={project.budgetHours}
                            caption={`${formatHours(spentHours)} of ${
                              project.budgetHours
                                ? formatHours(project.budgetHours)
                                : "∞"
                            }`}
                          />
                        ) : (
                          <div className="text-[13px]">
                            <p className="font-medium">
                              {formatMoney(
                                project.fixedAmount,
                                project.currency,
                              )}
                            </p>
                            <p className="text-[12px] text-[var(--color-muted)]">
                              {budgetTypeLabels.FIXED} ·{" "}
                              {formatHours(spentHours)} logged
                            </p>
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge color={projectStatusColors[project.status]}>
                          <Dot color={projectStatusColors[project.status]!} />
                          {projectStatusLabels[project.status]}
                        </Badge>
                      </td>
                      <td>
                        {project.manager ? (
                          <Avatar
                            name={project.manager.name}
                            color={project.manager.avatarColor}
                            size={28}
                          />
                        ) : (
                          <span className="text-[13px] text-[var(--color-muted)]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Phones get the same data as rows rather than a 900px table dragged
            sideways: key, name, status, crew and the budget bar. */}
        {projects.length > 0 ? (
          <ul className="divide-y divide-[var(--color-line)] md:hidden">
            {projects.map((project) => {
              const spentHours = spent.get(project.id) ?? 0;
              return (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="block px-4 py-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-ink-2)]">
                            {project.key}
                          </span>
                          <span className="truncate font-medium">
                            {project.name}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                          {project.client?.name ?? "Internal project"} ·{" "}
                          {project._count.tickets} tickets
                          {project.dueDate
                            ? ` · due ${formatDate(project.dueDate)}`
                            : ""}
                        </p>
                      </div>
                      <Badge color={projectStatusColors[project.status]}>
                        {projectStatusLabels[project.status]}
                      </Badge>
                    </div>

                    <div className="mt-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        {project.budgetType === "HOURLY" ? (
                          <BudgetBar
                            spent={spentHours}
                            total={project.budgetHours}
                            caption={`${formatHours(spentHours)} of ${
                              project.budgetHours
                                ? formatHours(project.budgetHours)
                                : "∞"
                            }`}
                          />
                        ) : (
                          <p className="num text-[12.5px] text-[var(--color-muted)]">
                            <span className="font-medium text-[var(--color-ink)]">
                              {formatMoney(
                                project.fixedAmount,
                                project.currency,
                              )}
                            </span>{" "}
                            fixed · {formatHours(spentHours)} logged
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {project.members.slice(0, 3).map((member) => (
                          <Avatar
                            key={member.id}
                            name={member.user.name}
                            color={member.user.avatarColor}
                            size={22}
                          />
                        ))}
                        {project.members.length > 3 ? (
                          <span className="text-[11.5px] text-[var(--color-muted)]">
                            +{project.members.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    </>
  );
}
