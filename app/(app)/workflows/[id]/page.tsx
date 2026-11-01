import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Flag, Trash2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import {
  deleteStatusAction,
  deleteTransitionAction,
  deleteWorkflowAction,
  duplicateWorkflowAction,
  moveStatusAction,
  setInitialStatusAction,
} from "@/app/actions/workflows";
import { categoryLabels } from "@/lib/labels";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import {
  AddStatusButton,
  EditStatusButton,
} from "@/components/workflow/status-forms";
import { AddTransitionForm } from "@/components/workflow/transition-form";
import { WorkflowCanvas } from "@/components/workflow/workflow-canvas";
import { withCanvasLayout } from "@/lib/workflow";
import { WorkflowSettingsForm } from "@/components/workflow/workflow-settings-form";
import { SubmitButton } from "@/components/ui/form";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const { id } = await params;
  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: {
      statuses: { orderBy: { position: "asc" } },
      transitions: true,
      projects: { orderBy: { name: "asc" } },
    },
  });
  if (!workflow) notFound();

  const statusById = new Map(workflow.statuses.map((s) => [s.id, s]));

  const ticketsByStatus = await prisma.ticket.groupBy({
    by: ["statusId"],
    where: { statusId: { in: workflow.statuses.map((s) => s.id) } },
    _count: { _all: true },
  });
  const ticketCount = new Map(
    ticketsByStatus.map((row) => [row.statusId, row._count._all]),
  );

  return (
    <>
      <PageHeader
        title={workflow.name}
        breadcrumb={
          <Link href="/workflows" className="hover:underline">
            Workflows
          </Link>
        }
        description={workflow.description ?? undefined}
        action={
          <form action={duplicateWorkflowAction}>
            <input type="hidden" name="id" value={workflow.id} />
            <SubmitButton size="md" variant="secondary" pendingText="Adding…">
              <Copy size={15} />
              Duplicate
            </SubmitButton>
          </form>
        }
      />

      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-[var(--color-muted)]">
            Drag a status to move it. Pull from the right edge of one node to
            the left edge of another to draw a transition. Click an arrow to set
            conditions and hooks.
          </p>
          <span className="flex items-center gap-3 text-[11.5px] text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 bg-[var(--color-faint)]" /> plain
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 border-t-2 border-dashed border-[var(--color-warn)]" />
              conditions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 bg-[#7c3aed]" /> hooks
            </span>
          </span>
        </div>

        <WorkflowCanvas
          workflowId={workflow.id}
          canEdit
          statuses={withCanvasLayout(workflow.statuses).map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            category: s.category,
            isInitial: s.isInitial,
            ticketCount: ticketCount.get(s.id) ?? 0,
            canvasX: s.canvasX,
            canvasY: s.canvasY,
          }))}
          transitions={workflow.transitions.map((t) => ({
            id: t.id,
            name: t.name,
            fromStatusId: t.fromStatusId,
            toStatusId: t.toStatusId,
            conditions: t.conditions,
            hooks: t.hooks,
          }))}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title="Statuses"
              description="Status order defines the column order on the board"
              action={<AddStatusButton workflowId={workflow.id} />}
            />

            {workflow.statuses.length === 0 ? (
              <EmptyState
                title="No statuses"
                description="Add at least one status — otherwise tickets cannot be created."
              />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {workflow.statuses.map((status, index) => (
                  <li
                    key={status.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: status.color }}
                    />

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-[13.5px] font-medium">
                        {status.name}
                        {status.isInitial ? (
                          <Badge color="#2563eb">initial</Badge>
                        ) : null}
                      </p>
                      <p className="text-[12px] text-[var(--color-muted)]">
                        {categoryLabels[status.category]} ·{" "}
                        {ticketCount.get(status.id) ?? 0} tickets
                      </p>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <form action={moveStatusAction}>
                        <input type="hidden" name="id" value={status.id} />
                        <input
                          type="hidden"
                          name="workflowId"
                          value={workflow.id}
                        />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          disabled={index === 0}
                          className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] disabled:opacity-30"
                        >
                          <ArrowUp size={14} />
                        </button>
                      </form>

                      <form action={moveStatusAction}>
                        <input type="hidden" name="id" value={status.id} />
                        <input
                          type="hidden"
                          name="workflowId"
                          value={workflow.id}
                        />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          disabled={index === workflow.statuses.length - 1}
                          className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] disabled:opacity-30"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </form>

                      {!status.isInitial ? (
                        <form action={setInitialStatusAction}>
                          <input type="hidden" name="id" value={status.id} />
                          <input
                            type="hidden"
                            name="workflowId"
                            value={workflow.id}
                          />
                          <button
                            type="submit"
                            title="Make it the initial status"
                            className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
                          >
                            <Flag size={14} />
                          </button>
                        </form>
                      ) : null}

                      <EditStatusButton
                        workflowId={workflow.id}
                        status={{
                          id: status.id,
                          name: status.name,
                          category: status.category,
                          color: status.color,
                        }}
                      />

                      <form action={deleteStatusAction}>
                        <input type="hidden" name="id" value={status.id} />
                        <input
                          type="hidden"
                          name="workflowId"
                          value={workflow.id}
                        />
                        <button
                          type="submit"
                          className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Transitions"
              description="With no transitions defined, a ticket can move anywhere"
            />

            {workflow.transitions.length === 0 ? (
              <EmptyState
                title="No transitions defined"
                description="The board runs unrestricted. Add transitions to lock the process down."
              />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {workflow.transitions
                  .slice()
                  .sort((a, b) => {
                    const an = a.fromStatusId
                      ? (statusById.get(a.fromStatusId)?.position ?? 0)
                      : -1;
                    const bn = b.fromStatusId
                      ? (statusById.get(b.fromStatusId)?.position ?? 0)
                      : -1;
                    return an - bn;
                  })
                  .map((transition) => {
                    const from = transition.fromStatusId
                      ? statusById.get(transition.fromStatusId)
                      : null;
                    const to = statusById.get(transition.toStatusId);

                    return (
                      <li
                        key={transition.id}
                        className="flex items-center gap-3 px-5 py-2.5 text-[13px]"
                      >
                        <span className="flex flex-1 flex-wrap items-center gap-2">
                          {from ? (
                            <Badge color={from.color}>{from.name}</Badge>
                          ) : (
                            <Badge>any status</Badge>
                          )}
                          <span className="text-[var(--color-faint)]">→</span>
                          {to ? (
                            <Badge color={to.color}>{to.name}</Badge>
                          ) : (
                            <Badge>?</Badge>
                          )}
                          <span className="text-[12px] text-[var(--color-muted)]">
                            «{transition.name}»
                          </span>
                        </span>

                        <form action={deleteTransitionAction}>
                          <input
                            type="hidden"
                            name="id"
                            value={transition.id}
                          />
                          <input
                            type="hidden"
                            name="workflowId"
                            value={workflow.id}
                          />
                          <button
                            type="submit"
                            className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                          >
                            <Trash2 size={13} />
                          </button>
                        </form>
                      </li>
                    );
                  })}
              </ul>
            )}

            {workflow.statuses.length >= 2 ? (
              <div className="border-t border-[var(--color-line)] px-5 py-4">
                <AddTransitionForm
                  workflowId={workflow.id}
                  statuses={workflow.statuses.map((s) => ({
                    id: s.id,
                    name: s.name,
                  }))}
                />
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-semibold">Settings</h2>
            <WorkflowSettingsForm
              workflow={{
                id: workflow.id,
                name: workflow.name,
                description: workflow.description,
              }}
            />
          </Card>

          <Card>
            <CardHeader
              title="Used by projects"
              description={`${workflow.projects.length} project(s)`}
            />
            {workflow.projects.length === 0 ? (
              <EmptyState title="Not used yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {workflow.projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-2 px-5 py-2.5 text-[13px] transition hover:bg-[var(--color-hover)]"
                    >
                      <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-ink-2)]">
                        {project.key}
                      </span>
                      <span className="truncate">{project.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="border-[var(--color-danger-line)]">
            <CardHeader title="Delete" />
            <div className="px-5 py-4">
              <form action={deleteWorkflowAction}>
                <input type="hidden" name="id" value={workflow.id} />
                <Button
                  type="submit"
                  variant="danger"
                  size="sm"
                  disabled={workflow.projects.length > 0}
                >
                  Delete workflow
                </Button>
              </form>
              <p className="mt-2 text-[12px] text-[var(--color-muted)]">
                {workflow.projects.length > 0
                  ? "Switch those projects to another workflow first."
                  : "This cannot be undone."}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
