import Link from "next/link";
import { ArrowRight, MessageSquare } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { projectScope } from "@/lib/permissions";
import { spentHoursByProject } from "@/lib/budget";
import { portalSettings } from "@/lib/portal";
import { projectStatusColors, projectStatusLabels } from "@/lib/labels";
import { formatDate, formatHours, formatMoney } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Card,
  Dot,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { BudgetBar } from "@/components/project/budget-bar";

export default async function PortalHome() {
  const user = await requireUser();

  const projects = await prisma.project.findMany({
    where: {
      AND: [projectScope(user), { status: { not: "ARCHIVED" } }],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      manager: true,
      _count: { select: { tickets: true } },
    },
  });

  const spent = await spentHoursByProject(projects.map((p) => p.id));

  // Unread per project, so the card itself says where the conversation is.
  const unreadRows = await prisma.chatMessage.groupBy({
    by: ["projectId"],
    where: {
      project: { AND: [projectScope(user), { portalShowChat: true }] },
      isInternal: false,
      readAt: null,
      NOT: { authorId: user.id },
    },
    _count: { _all: true },
  });
  const unread = new Map(unreadRows.map((r) => [r.projectId, r._count._all]));
  const unreadTotal = unreadRows.reduce((sum, r) => sum + r._count._all, 0);

  return (
    <>
      <PageHeader
        title="Your projects"
        description={
          unreadTotal > 0
            ? `${projects.length} in progress. ${unreadTotal} new message${unreadTotal === 1 ? "" : "s"} from the studio.`
            : `${projects.length} in progress. Everything the studio is doing for you.`
        }
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState
            title="No projects yet"
            description="As soon as your manager creates one, it shows up here with its progress, files and the chat."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => {
            const portal = portalSettings(project);
            const spentHours = spent.get(project.id) ?? 0;
            const newMessages = unread.get(project.id) ?? 0;

            return (
              <Link
                key={project.id}
                href={`/portal/${project.id}`}
                className="group card flex flex-col p-5 transition-[border-color,transform] duration-[var(--dur)] ease-[var(--ease-out)] hover:border-[var(--color-line-strong)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15.5px] font-semibold">
                    {project.name}
                  </h3>
                  <Badge color={projectStatusColors[project.status]}>
                    <Dot color={projectStatusColors[project.status]!} />
                    {projectStatusLabels[project.status]}
                  </Badge>
                </div>

                <div className="mt-3 flex items-center gap-2 text-[13px] text-[var(--color-muted)]">
                  {project.manager ? (
                    <>
                      <Avatar
                        name={project.manager.name}
                        color={project.manager.avatarColor}
                        size={20}
                      />
                      <span>{project.manager.name}</span>
                    </>
                  ) : (
                    <span>No manager assigned yet</span>
                  )}
                  {portal.dueDate && project.dueDate ? (
                    <span className="num">
                      due {formatDate(project.dueDate)}
                    </span>
                  ) : null}
                </div>

                {project.budgetType === "HOURLY" && portal.hours ? (
                  <div className="mt-4">
                    <BudgetBar
                      spent={spentHours}
                      total={project.budgetHours}
                      caption={
                        project.budgetHours
                          ? `${formatHours(spentHours)} of ${formatHours(project.budgetHours)}`
                          : `${formatHours(spentHours)} logged`
                      }
                    />
                  </div>
                ) : project.budgetType === "FIXED" && portal.money ? (
                  <p className="mt-4 text-[13px] text-[var(--color-muted)]">
                    Agreed budget{" "}
                    <span className="num font-medium text-[var(--color-ink)]">
                      {formatMoney(project.fixedAmount, project.currency)}
                    </span>
                  </p>
                ) : null}

                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-3 text-[12.5px]">
                  {newMessages > 0 ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-[var(--color-brand)]">
                      <MessageSquare size={14} />
                      {newMessages} new message{newMessages === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted)]">
                      No unread messages
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 font-medium text-[var(--color-ink-2)] transition-transform duration-[var(--dur)] ease-[var(--ease-out)] group-hover:translate-x-0.5">
                    Open
                    <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
