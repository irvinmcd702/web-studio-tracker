import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { transitionMap } from "@/lib/workflow";
import { projectAssignees } from "@/lib/queries";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Board } from "@/components/project/board";
import { CreateTicketButton } from "@/components/project/create-ticket-button";

export default async function BoardPage({
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
      tickets: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: { assignee: true },
      },
    },
  });
  if (!project) notFound();

  const [transitions, assignees] = await Promise.all([
    transitionMap(project.workflowId),
    projectAssignees(project.id),
  ]);

  const canEdit = canEditProject(user);

  if (project.workflow.statuses.length === 0) {
    return (
      <Card>
        <EmptyState
          title="This workflow has no statuses"
          description="The board is built from the project workflow statuses."
          action={
            <Link
              href={`/workflows/${project.workflowId}`}
              className="text-sm font-medium text-[var(--color-brand)] hover:underline"
            >
              Configure the workflow →
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--color-muted)]">
          {project.tickets.length} tickets ·{" "}
          {canEdit ? "drag cards or use the move button" : "read-only view"}
        </p>
        {canEdit ? (
          <CreateTicketButton
            projectId={project.id}
            assignees={assignees}
            statuses={project.workflow.statuses.map((s) => ({
              id: s.id,
              name: s.name,
            }))}
          />
        ) : null}
      </div>

      <Board
        projectKey={project.key}
        canEdit={canEdit}
        transitions={transitions}
        statuses={project.workflow.statuses.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          category: s.category,
        }))}
        tickets={project.tickets.map((t) => ({
          id: t.id,
          number: t.number,
          title: t.title,
          type: t.type,
          priority: t.priority,
          statusId: t.statusId,
          estimate: t.estimate,
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
          assignee: t.assignee
            ? { name: t.assignee.name, avatarColor: t.assignee.avatarColor }
            : null,
        }))}
      />
    </div>
  );
}
