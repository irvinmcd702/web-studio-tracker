import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { allowedTargets } from "@/lib/workflow";
import { projectAssignees } from "@/lib/queries";
import {
  deleteCommentAction,
  deleteTicketAction,
  deleteWorkLogAction,
} from "@/app/actions/tickets";
import {
  categoryLabels,
  priorityColors,
  priorityLabels,
  ticketTypeColors,
  ticketTypeLabels,
} from "@/lib/labels";
import {
  formatDate,
  formatDateTime,
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
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { CommentForm } from "@/components/ticket/comment-form";
import { WorkLogForm } from "@/components/ticket/worklog-form";
import { StatusActions } from "@/components/ticket/status-actions";
import { AttachmentList } from "@/components/attachment/attachment-list";
import { TimerButton } from "@/components/timer/timer-button";
import { EditTicketButton } from "@/components/ticket/edit-ticket-button";
import { AcceptanceDraft } from "@/components/ticket/acceptance-draft";
import { aiAllowedForProject, aiStatus } from "@/lib/ai";
import { markMentionsRead, mentionableOn } from "@/lib/mentions";
import { MentionText } from "@/components/ui/mention-text";
import { FileUpload } from "@/components/project/file-upload";
import { ConfirmIconSubmit } from "@/components/ui/confirm-submit";
import { CopyPromptButton } from "@/components/ticket/copy-prompt";
import { BranchName } from "@/components/ticket/branch-name";
import { branchNameFor } from "@/lib/git-events";
import { Markdown } from "@/components/docs/markdown";
import { buildTicketPrompt } from "@/lib/ticket-prompt";
import { describeConditions, parseConditions } from "@/lib/workflow-rules";
import { appUrl } from "@/lib/rocketchat";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      project: { include: { client: true } },
      status: true,
      assignee: true,
      reporter: true,
      comments: { orderBy: { createdAt: "asc" }, include: { author: true } },
      workLogs: { orderBy: { spentOn: "desc" }, include: { user: true } },
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: true },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { user: true },
      },
    },
  });
  if (!ticket) notFound();
  if (!(await canAccessProject(user, ticket.projectId))) notFound();

  const [targets, assignees, timer, outgoing] = await Promise.all([
    allowedTargets(ticket.project.workflowId, ticket.statusId),
    projectAssignees(ticket.projectId),
    prisma.runningTimer.findUnique({ where: { userId: user.id } }),
    prisma.workflowTransition.findMany({
      where: {
        workflowId: ticket.project.workflowId,
        OR: [{ fromStatusId: ticket.statusId }, { fromStatusId: null }],
      },
    }),
  ]);

  // A specific arrow's label beats the catch-all's, matching how the server
  // picks which transition actually applies.
  const transitionLabels = new Map<string, string>();
  for (const t of outgoing) {
    if (t.fromStatusId === null && transitionLabels.has(t.toStatusId)) continue;
    if (t.fromStatusId !== null || !transitionLabels.has(t.toStatusId)) {
      transitionLabels.set(t.toStatusId, t.name);
    }
  }

  // Who could have been named here — used to show a handle as a handle only
  // when it actually reached somebody. The picker gets the same list without
  // you in it, because naming yourself notifies nobody.
  const mentionable = await mentionableOn(ticket.projectId);
  const handles = mentionable.map((p) => p.handle);
  const mentionPeople = mentionable.filter((p) => p.id !== user.id);

  // Opening the thing you were named in is the same as reading the mention.
  await markMentionsRead({ userId: user.id, ticketId: ticket.id });

  const canEdit = canEditProject(user);
  // No button at all unless the studio turned drafting on and this project
  // agreed to its material being sent. Nothing to explain away on a ticket in
  // a studio that never wanted the feature.
  const status = await aiStatus();
  const canDraft =
    canEdit && status.usable && (await aiAllowedForProject(ticket.projectId));
  const spent = ticket.workLogs.reduce((sum, log) => sum + log.hours, 0);
  const key = ticketKey(ticket.project.key, ticket.number);

  // The same brief an agent gets through the API, ready to paste into
  // whatever the developer works with.
  const prompt = buildTicketPrompt({
    ticket,
    appUrl: appUrl(),
    transitions: targets.map((status) => ({
      to: status.name,
      requires: describeConditions(
        parseConditions(
          outgoing.find(
            (t) =>
              t.toStatusId === status.id && t.fromStatusId === ticket.statusId,
          )?.conditions ??
            outgoing.find(
              (t) => t.toStatusId === status.id && t.fromStatusId === null,
            )?.conditions,
        ),
      ),
    })),
  });

  return (
    <>
      <div className="mb-5">
        <div className="mb-1 text-[13px] text-[var(--color-muted)]">
          <Link href="/projects" className="hover:underline">
            Projects
          </Link>
          {" · "}
          <Link
            href={`/projects/${ticket.projectId}`}
            className="hover:underline"
          >
            {ticket.project.name}
          </Link>
          {" · "}
          <Link
            href={`/projects/${ticket.projectId}/board`}
            className="hover:underline"
          >
            Board
          </Link>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded bg-[var(--color-surface-3)] px-2 py-0.5 font-mono text-[12px] font-semibold text-[var(--color-ink-2)]">
                {key}
              </span>
              <Badge color={ticketTypeColors[ticket.type]}>
                {ticketTypeLabels[ticket.type]}
              </Badge>
              <Badge color={priorityColors[ticket.priority]}>
                {priorityLabels[ticket.priority]}
              </Badge>
              {ticket.isClientVisible ? (
                <Badge color="#16a34a">visible to client</Badge>
              ) : null}
            </div>
            <h1 className="mt-2 text-[22px] font-semibold leading-tight tracking-tight">
              {ticket.title}
            </h1>
          </div>

          {canEdit ? (
            <div className="flex items-center gap-2">
              <EditTicketButton
                assignees={assignees}
                values={{
                  id: ticket.id,
                  title: ticket.title,
                  description: ticket.description,
                  acceptance: ticket.acceptance,
                  type: ticket.type,
                  priority: ticket.priority,
                  estimate: ticket.estimate,
                  dueDate: ticket.dueDate
                    ? ticket.dueDate.toISOString().slice(0, 10)
                    : "",
                  assigneeId: ticket.assigneeId,
                  isClientVisible: ticket.isClientVisible,
                }}
              />
              {user.role === "ADMIN" || user.role === "MANAGER" ? (
                <form action={deleteTicketAction}>
                  <input type="hidden" name="id" value={ticket.id} />
                  <ConfirmIconSubmit title="Delete this ticket">
                    <Trash2 size={14} />
                  </ConfirmIconSubmit>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Description" />
            <div className="px-5 py-4 text-sm leading-relaxed">
              {ticket.description ? (
                <p className="whitespace-pre-wrap">{ticket.description}</p>
              ) : (
                <p className="text-[var(--color-muted)]">No description</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Done means"
              description="What has to be true before this ticket moves on"
            />
            <div className="space-y-4 px-5 py-4 text-sm leading-relaxed">
              {ticket.acceptance ? (
                <Markdown>{ticket.acceptance}</Markdown>
              ) : (
                <p className="text-[13px] text-[var(--color-muted)]">
                  Not written yet. Whoever picks this up — a person or an agent
                  — has to guess what finished looks like.
                </p>
              )}
              {canDraft ? (
                <div className="border-t border-[var(--color-line)] pt-4">
                  <AcceptanceDraft
                    ticketId={ticket.id}
                    hasAcceptance={Boolean(ticket.acceptance)}
                  />
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Hand over to an agent"
              description="The ticket, its acceptance criteria and the legal moves, as one prompt"
            />
            <div className="px-5 py-4">
              <CopyPromptButton prompt={prompt} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Comments"
              description={`${ticket.comments.length} total`}
            />
            {ticket.comments.length === 0 ? (
              <EmptyState title="No comments yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {ticket.comments.map((comment) => (
                  <li key={comment.id} className="flex gap-3 px-5 py-4">
                    <Avatar
                      name={comment.author.name}
                      color={comment.author.avatarColor}
                      size={28}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium">
                          {comment.author.name}
                        </span>
                        <span className="text-[11.5px] text-[var(--color-muted)]">
                          {formatRelative(comment.createdAt)}
                        </span>
                        {comment.authorId === user.id ||
                        user.role === "ADMIN" ? (
                          <form
                            action={deleteCommentAction}
                            className="ml-auto"
                          >
                            <input type="hidden" name="id" value={comment.id} />
                            <button
                              type="submit"
                              className="rounded p-1 text-[var(--color-muted)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </form>
                        ) : null}
                      </div>
                      <MentionText
                        body={comment.body}
                        handles={handles}
                        className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {canEdit ? (
              <div className="border-t border-[var(--color-line)] px-5 py-4">
                <CommentForm ticketId={ticket.id} people={mentionPeople} />
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Ticket files"
              description={`${ticket.attachments.length} total`}
            />
            <AttachmentList
              canManage={canEdit}
              showUploader={false}
              items={ticket.attachments.map((file) => ({
                id: file.id,
                originalName: file.originalName,
                mimeType: file.mimeType,
                size: file.size,
                createdAt: file.createdAt.toISOString(),
                isClientVisible: file.isClientVisible,
                uploadedBy: {
                  name: file.uploadedBy.name,
                  avatarColor: file.uploadedBy.avatarColor,
                },
                ticket: null,
              }))}
            />
            {canEdit ? (
              <div className="border-t border-[var(--color-line)] px-5 py-4">
                <FileUpload ticketId={ticket.id} compact />
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Status" />
            <div className="space-y-3 px-5 py-4">
              <div className="flex items-center gap-2">
                <Badge color={ticket.status.color}>
                  <Dot color={ticket.status.color} />
                  {ticket.status.name}
                </Badge>
                <span className="text-[12px] text-[var(--color-muted)]">
                  {categoryLabels[ticket.status.category]}
                </span>
              </div>

              {canEdit ? (
                <StatusActions
                  ticketId={ticket.id}
                  targets={targets.map((target) => ({
                    id: target.id,
                    name: target.name,
                    // Prefer the arrow's own wording when it has one.
                    label: transitionLabels.get(target.id) ?? target.name,
                  }))}
                />
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Branch"
              description="Keep the key in the name and git reports back here"
            />
            <div className="px-5 py-4">
              <BranchName branch={branchNameFor(key, ticket.title)} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-2.5 px-5 py-4 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--color-muted)]">Assignee</dt>
                <dd className="flex items-center gap-2">
                  {ticket.assignee ? (
                    <>
                      <Avatar
                        name={ticket.assignee.name}
                        color={ticket.assignee.avatarColor}
                        size={20}
                      />
                      {ticket.assignee.name}
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--color-muted)]">Reporter</dt>
                <dd>{ticket.reporter?.name ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--color-muted)]">Estimate</dt>
                <dd>{formatHours(ticket.estimate)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--color-muted)]">Logged</dt>
                <dd
                  className={
                    ticket.estimate != null && spent > ticket.estimate
                      ? "font-medium text-[var(--color-danger)]"
                      : "font-medium"
                  }
                >
                  {formatHours(spent)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--color-muted)]">Due date</dt>
                <dd>{formatDate(ticket.dueDate)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[var(--color-muted)]">Created</dt>
                <dd>{formatDate(ticket.createdAt)}</dd>
              </div>
            </dl>
          </Card>

          {canEdit ? (
            <Card>
              <CardHeader title="Log time" />
              <div className="border-b border-[var(--color-line)] px-5 py-4">
                <TimerButton
                  ticketId={ticket.id}
                  running={
                    timer && timer.ticketId === ticket.id
                      ? timer.startedAt.toISOString()
                      : null
                  }
                />
              </div>
              <div className="px-5 py-4">
                <WorkLogForm ticketId={ticket.id} />
              </div>
              {ticket.workLogs.length > 0 ? (
                <ul className="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
                  {ticket.workLogs.map((log) => (
                    <li
                      key={log.id}
                      className="flex items-center gap-2 px-5 py-2.5 text-[12.5px]"
                    >
                      <Avatar
                        name={log.user.name}
                        color={log.user.avatarColor}
                        size={20}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {log.description ?? log.user.name}
                      </span>
                      {/* Hours written through an agent token say so here, and
                          nowhere else does the entry pretend otherwise. */}
                      {log.source === "AGENT" ? (
                        <span
                          className="rounded-full border border-[var(--color-brand-line)] bg-[var(--color-brand-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-brand)]"
                          title="Logged by a coding agent"
                        >
                          agent
                        </span>
                      ) : null}
                      <span className="text-[var(--color-muted)]">
                        {formatDate(log.spentOn)}
                      </span>
                      <span className="font-medium">
                        {formatHours(log.hours)}
                      </span>
                      {log.userId === user.id ||
                      user.role === "ADMIN" ||
                      user.role === "MANAGER" ? (
                        <form action={deleteWorkLogAction}>
                          <input type="hidden" name="id" value={log.id} />
                          <button
                            type="submit"
                            className="rounded p-1 text-[var(--color-muted)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                          >
                            <Trash2 size={13} />
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader title="History" />
            {ticket.activities.length === 0 ? (
              <EmptyState title="No events" />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {ticket.activities.map((item) => (
                  <li key={item.id} className="px-5 py-2.5 text-[12.5px]">
                    <p>
                      <span className="font-medium">
                        {item.user?.name ?? "System"}
                      </span>{" "}
                      <span className="text-[var(--color-muted)]">
                        {item.message}
                      </span>
                    </p>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      {formatDateTime(item.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
