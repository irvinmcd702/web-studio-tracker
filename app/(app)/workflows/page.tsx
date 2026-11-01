import Link from "next/link";
import { redirect } from "next/navigation";
import { GitBranch, Star } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { setDefaultWorkflowAction } from "@/app/actions/workflows";
import { categoryLabels } from "@/lib/labels";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { CreateWorkflowButton } from "@/components/workflow/create-workflow-button";

export default async function WorkflowsPage() {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const workflows = await prisma.workflow.findMany({
    where: { isArchived: false },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      statuses: { orderBy: { position: "asc" } },
      _count: { select: { projects: true, transitions: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Status sets and transitions that projects use for their tickets"
        action={<CreateWorkflowButton />}
      />

      {workflows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<GitBranch size={30} />}
            title="No workflows yet"
            description="A project needs a workflow — without one, tickets have no statuses."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {workflows.map((workflow) => (
            <Card key={workflow.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/workflows/${workflow.id}`}
                      className="text-[15px] font-semibold hover:text-[var(--color-brand)] hover:underline"
                    >
                      {workflow.name}
                    </Link>
                    {workflow.isDefault ? (
                      <Badge color="#f59e0b">
                        <Star size={13} />
                        default
                      </Badge>
                    ) : null}
                  </div>
                  {workflow.description ? (
                    <p className="mt-1 text-[13px] text-[var(--color-muted)]">
                      {workflow.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">
                    {workflow.statuses.length} statuses ·{" "}
                    {workflow._count.transitions} transitions ·{" "}
                    {workflow._count.projects} project(s)
                  </p>
                </div>

                {!workflow.isDefault ? (
                  <form action={setDefaultWorkflowAction}>
                    <input type="hidden" name="id" value={workflow.id} />
                    <button
                      type="submit"
                      className="text-[13px] font-medium text-[var(--color-muted)] transition hover:text-[var(--color-brand)]"
                    >
                      Make default
                    </button>
                  </form>
                ) : null}
              </div>

              {workflow.statuses.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {workflow.statuses.map((status, index) => (
                    <span key={status.id} className="flex items-center gap-1.5">
                      {index > 0 ? (
                        <span className="text-[var(--color-faint)]">→</span>
                      ) : null}
                      {/* The tint and the dot carry the colour; the label does
                          not. A status colour is chosen by whoever built the
                          workflow, and a pale one used as text on a tint of
                          itself lands anywhere between 2.4:1 and 4.5:1 — there
                          is no palette that fixes that, because the palette is
                          the user's. Ink on the tint is legible whatever they
                          pick, in either theme. */}
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-[var(--color-ink)]"
                        style={{ backgroundColor: `${status.color}1a` }}
                        title={categoryLabels[status.category]}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-[13px] text-[var(--color-warn)]">
                  No statuses yet — the project board would be empty.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
