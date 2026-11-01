import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { projectStatusColors, projectStatusLabels } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { Avatar, Badge, Dot } from "@/components/ui/primitives";
import { ProjectTabs } from "@/components/project/project-tabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;

  if (!(await canAccessProject(user, id))) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: true,
      manager: true,
      workflow: true,
      members: { include: { user: true }, orderBy: { addedAt: "asc" } },
    },
  });
  if (!project) notFound();

  const [unreadChat, pendingApprovals] = await Promise.all([
    prisma.chatMessage.count({
      where: {
        projectId: id,
        readAt: null,
        isInternal: false,
        author: { role: "CLIENT" },
      },
    }),
    // Stages the client has sent back count as needing attention too.
    prisma.approval.count({
      where: { projectId: id, status: "CHANGES_REQUESTED" },
    }),
  ]);

  return (
    <>
      <div className="mb-5">
        <div className="mb-1 text-[13px] text-[var(--color-muted)]">
          <Link href="/projects" className="hover:underline">
            Projects
          </Link>
          {project.client ? (
            <>
              {" · "}
              <Link
                href={`/clients/${project.client.id}`}
                className="hover:underline"
              >
                {project.client.name}
              </Link>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded bg-[var(--color-surface-3)] px-2 py-1 font-mono text-[12px] font-semibold text-[var(--color-ink-2)]">
            {project.key}
          </span>
          <h1 className="text-[22px] font-semibold tracking-tight">
            {project.name}
          </h1>
          <Badge color={projectStatusColors[project.status]}>
            <Dot color={projectStatusColors[project.status]!} />
            {projectStatusLabels[project.status]}
          </Badge>
          {project.isConfidential ? (
            // Whoever is looking at this got here legitimately — the point of
            // the badge is that they know to treat what they read accordingly.
            <Badge color="#b45309">
              <Lock size={11} />
              Closed
            </Badge>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[var(--color-muted)]">
          {project.manager ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar
                name={project.manager.name}
                color={project.manager.avatarColor}
                size={20}
              />
              PM: {project.manager.name}
            </span>
          ) : (
            <span>No PM assigned</span>
          )}
          <span>Workflow: {project.workflow.name}</span>
          {project.dueDate ? (
            <span>Due: {formatDate(project.dueDate)}</span>
          ) : null}
          {project.members.length ? (
            <span className="inline-flex items-center gap-1">
              Crew:
              {project.members.slice(0, 6).map((member) => (
                <Avatar
                  key={member.id}
                  name={member.user.name}
                  color={member.user.avatarColor}
                  size={20}
                  title={
                    member.role
                      ? `${member.user.name} — ${member.role}`
                      : member.user.name
                  }
                />
              ))}
              {project.members.length > 6 ? (
                <span>+{project.members.length - 6}</span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mb-6 border-b border-[var(--color-line)]">
        <ProjectTabs
          projectId={project.id}
          canEdit={canEditProject(user)}
          unreadChat={unreadChat}
          pendingApprovals={pendingApprovals}
        />
      </div>

      {children}
    </>
  );
}
