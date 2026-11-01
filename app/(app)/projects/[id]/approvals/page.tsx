import { notFound } from "next/navigation";
import { Send, Trash2, Undo2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { portalSettings } from "@/lib/portal";
import { approvalStatusColors, approvalStatusLabels } from "@/lib/approvals";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import {
  deleteApprovalAction,
  sendApprovalAction,
  withdrawApprovalAction,
} from "@/app/actions/approvals";
import {
  Badge,
  Card,
  CardHeader,
  Dot,
  EmptyState,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/project/file-upload";
import {
  CreateApprovalButton,
  EditApprovalButton,
} from "@/components/approval/approval-form";
import { DecisionForm } from "@/components/approval/decision-form";
import { AttachmentList } from "@/components/attachment/attachment-list";
import { SubmitButton } from "@/components/ui/form";

export default async function ProjectApprovalsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  if (!(await canAccessProject(user, id))) notFound();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const approvals = await prisma.approval.findMany({
    where: { projectId: id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      requestedBy: true,
      decidedBy: true,
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });

  const canEdit = canEditProject(user);
  const portal = portalSettings(project);

  const approvedValue = approvals
    .filter((a) => a.status === "APPROVED")
    .reduce((sum, a) => sum + (a.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[var(--color-muted)]">
          {approvals.length} stage(s)
          {approvedValue > 0
            ? ` · ${formatMoney(approvedValue, project.currency)} approved`
            : ""}
          {portal.approvals ? "" : " · hidden from the client portal"}
        </p>
        {canEdit ? (
          <CreateApprovalButton projectId={id} currency={project.currency} />
        ) : null}
      </div>

      {!portal.approvals && approvals.length > 0 ? (
        <div className="rounded-lg bg-[var(--color-warn-soft)] px-4 py-3 text-[13px] text-[var(--color-warn)]">
          Stage approvals are switched off for this project&rsquo;s portal, so
          the client can&rsquo;t see or decide on these. Turn them on in the
          project settings.
        </div>
      ) : null}

      {approvals.length === 0 ? (
        <Card>
          <EmptyState
            title="No stages yet"
            description="Create a stage — a design, a milestone, a release — and send it to the client for sign-off."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <Card key={approval.id}>
              <CardHeader
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {approval.title}
                    <Badge color={approvalStatusColors[approval.status]}>
                      <Dot color={approvalStatusColors[approval.status]!} />
                      {approvalStatusLabels[approval.status]}
                    </Badge>
                    {approval.amount ? (
                      <Badge>
                        {formatMoney(approval.amount, project.currency)}
                      </Badge>
                    ) : null}
                  </span>
                }
                description={[
                  approval.requestedAt
                    ? `Sent ${formatDateTime(approval.requestedAt)}${
                        approval.requestedBy
                          ? ` by ${approval.requestedBy.name}`
                          : ""
                      }`
                    : "Not sent yet",
                  approval.dueDate
                    ? `respond by ${formatDate(approval.dueDate)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                action={
                  canEdit ? (
                    <span className="flex items-center gap-1">
                      <EditApprovalButton
                        currency={project.currency}
                        values={{
                          id: approval.id,
                          title: approval.title,
                          description: approval.description,
                          amount: approval.amount,
                          dueDate: approval.dueDate
                            ? approval.dueDate.toISOString().slice(0, 10)
                            : "",
                        }}
                      />
                      <form action={deleteApprovalAction}>
                        <input type="hidden" name="id" value={approval.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          <Trash2 size={14} />
                        </Button>
                      </form>
                    </span>
                  ) : null
                }
              />

              <div className="space-y-4 px-5 py-4">
                {approval.description ? (
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
                    {approval.description}
                  </p>
                ) : null}

                {approval.decidedAt ? (
                  <div
                    className={
                      approval.status === "APPROVED"
                        ? "rounded-lg bg-[var(--color-ok-soft)] px-3 py-2.5"
                        : "rounded-lg bg-[var(--color-danger-soft)] px-3 py-2.5"
                    }
                  >
                    <p
                      className={
                        approval.status === "APPROVED"
                          ? "text-[13px] font-medium text-[var(--color-ok)]"
                          : "text-[13px] font-medium text-[var(--color-danger)]"
                      }
                    >
                      {approval.status === "APPROVED"
                        ? "Approved"
                        : "Changes requested"}{" "}
                      by {approval.decidedBy?.name ?? "—"}
                      {approval.decidedBy &&
                      approval.decidedBy.role !== "CLIENT"
                        ? " (recorded by the studio)"
                        : ""}
                      , {formatDateTime(approval.decidedAt)}
                    </p>
                    {approval.decisionNote ? (
                      <p className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--color-ink-2)]">
                        {approval.decisionNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {approval.attachments.length > 0 ? (
                  <div className="-mx-5">
                    <AttachmentList
                      canManage={canEdit}
                      showUploader={false}
                      items={approval.attachments.map((file) => ({
                        id: file.id,
                        originalName: file.originalName,
                        mimeType: file.mimeType,
                        size: file.size,
                        createdAt: file.createdAt.toISOString(),
                        isClientVisible: file.isClientVisible,
                        uploadedBy: null,
                        ticket: null,
                      }))}
                    />
                  </div>
                ) : null}

                {canEdit ? (
                  <div className="grid gap-4 border-t border-[var(--color-line)] pt-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                        Actions
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {approval.status !== "APPROVED" ? (
                          <form action={sendApprovalAction}>
                            <input
                              type="hidden"
                              name="id"
                              value={approval.id}
                            />
                            <SubmitButton size="sm" pendingText="Sending…">
                              <Send size={14} />
                              {approval.status === "DRAFT"
                                ? "Send to client"
                                : "Send again"}
                            </SubmitButton>
                          </form>
                        ) : null}

                        {approval.status !== "DRAFT" ? (
                          <form action={withdrawApprovalAction}>
                            <input
                              type="hidden"
                              name="id"
                              value={approval.id}
                            />
                            <SubmitButton
                              size="sm"
                              variant="secondary"
                              pendingText="Saving…"
                            >
                              <Undo2 size={14} />
                              Back to draft
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>

                      {approval.status !== "DRAFT" ? (
                        <DecisionForm
                          approvalId={approval.id}
                          recordingForClient
                        />
                      ) : null}
                    </div>

                    <div>
                      <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                        Attach files
                      </p>
                      <FileUpload
                        approvalId={approval.id}
                        showVisibilityToggle={false}
                        compact
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
