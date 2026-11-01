import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { projectBudget } from "@/lib/budget";
import { portalSettings } from "@/lib/portal";
import {
  approvalStatusColors,
  approvalStatusLabels,
  stageTrack,
  CLIENT_VISIBLE_STATUSES,
} from "@/lib/approvals";
import { projectStatusColors, projectStatusLabels } from "@/lib/labels";
import {
  formatDate,
  formatDateTime,
  formatHours,
  formatMoney,
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
import { BudgetBar } from "@/components/project/budget-bar";
import { ProjectChat } from "@/components/project/chat";
import { FileUpload } from "@/components/project/file-upload";
import { DecisionForm } from "@/components/approval/decision-form";
import { StageTrack } from "@/components/approval/stage-track";
import { AttachmentList } from "@/components/attachment/attachment-list";
import { Markdown } from "@/components/docs/markdown";

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!(await canAccessProject(user, id))) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      manager: true,
      members: { include: { user: true }, orderBy: { addedAt: "asc" } },
    },
  });
  if (!project) notFound();

  const portal = portalSettings(project);

  const [budget, tickets, files, messages, approvals, docs] = await Promise.all(
    [
      projectBudget(project),
      portal.tasks
        ? prisma.ticket.findMany({
            where: { projectId: id, isClientVisible: true },
            orderBy: { number: "desc" },
            include: { status: true },
          })
        : Promise.resolve([]),
      portal.files
        ? prisma.attachment.findMany({
            where: { projectId: id, isClientVisible: true },
            orderBy: { createdAt: "desc" },
            include: { uploadedBy: true },
          })
        : Promise.resolve([]),
      portal.chat
        ? prisma.chatMessage.findMany({
            where: { projectId: id, isInternal: false },
            orderBy: { createdAt: "asc" },
            include: { author: true },
          })
        : Promise.resolve([]),
      // Drafts stay internal — the client only sees what was actually sent.
      // A project showing its plan of stages is the one exception, and a
      // narrow one: the draft rows come back so the path can be drawn, and
      // `stageTrack` keeps everything but their names out of what is rendered.
      portal.approvals
        ? prisma.approval.findMany({
            where: {
              projectId: id,
              status: {
                in: portal.stagePlan
                  ? [...CLIENT_VISIBLE_STATUSES, "DRAFT"]
                  : [...CLIENT_VISIBLE_STATUSES],
              },
            },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            include: { decidedBy: true, attachments: true },
          })
        : Promise.resolve([]),
      // Only docs explicitly marked as shared ever reach the portal.
      portal.docs
        ? prisma.doc.findMany({
            where: { projectId: id, isClientVisible: true },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),
    ],
  );

  // The path across the top of the card, and the stages the client can
  // actually open underneath it. A draft appears in the first and never in
  // the second: there is nothing to read on it and nothing to decide yet.
  const stages = stageTrack(approvals, { plan: portal.stagePlan });
  const decidable = approvals.filter((a) => a.status !== "DRAFT");

  // The crew, as the client should see it: a name and what they do here.
  const team = portal.team
    ? project.members.map((member) => ({
        id: member.id,
        name: member.user.name,
        color: member.user.avatarColor,
        title: member.role ?? member.user.position ?? "Studio team",
      }))
    : [];

  const showHourlyBudgetBar =
    project.budgetType === "HOURLY" &&
    portal.hours &&
    Boolean(project.budgetHours);

  const stats: React.ReactNode[] = [];
  if (portal.tasks) {
    stats.push(
      <Stat
        key="tasks"
        label="Tasks in progress"
        value={tickets.filter((t) => t.status.category !== "DONE").length}
        sub={`${tickets.filter((t) => t.status.category === "DONE").length} completed`}
      />,
    );
  }
  if (portal.hours) {
    stats.push(
      <Stat
        key="hours"
        label="Hours logged"
        value={formatHours(budget.spentHours)}
        sub={
          // The client is told about agent work only when this project's
          // portal switch says so. Off by default: disclosure is a decision.
          portal.agentHours && budget.agentHours > 0
            ? `${formatHours(budget.agentHours)} of it with an AI assistant`
            : project.budgetType === "HOURLY" && budget.budgetHours
              ? `of ${formatHours(budget.budgetHours)}`
              : undefined
        }
      />,
    );
  }
  if (portal.money) {
    stats.push(
      project.budgetType === "FIXED" ? (
        <Stat
          key="money"
          label="Contract amount"
          value={formatMoney(project.fixedAmount, project.currency)}
          sub="Fixed price"
        />
      ) : (
        <Stat
          key="money"
          label="Billed so far"
          value={formatMoney(budget.spentAmount, project.currency)}
          sub={
            project.hourlyRate
              ? `${formatMoney(project.hourlyRate, project.currency)}/h`
              : undefined
          }
        />
      ),
    );
  }

  return (
    <>
      <PageHeader
        title={project.name}
        breadcrumb={
          <Link href="/portal" className="hover:underline">
            Your projects
          </Link>
        }
        description={
          <span className="inline-flex items-center gap-2">
            <Badge color={projectStatusColors[project.status]}>
              <Dot color={projectStatusColors[project.status]!} />
              {projectStatusLabels[project.status]}
            </Badge>
            {project.manager ? (
              <span>Manager: {project.manager.name}</span>
            ) : null}
            {portal.dueDate && project.dueDate ? (
              <span>· due {formatDate(project.dueDate)}</span>
            ) : null}
          </span>
        }
      />

      {stats.length > 0 ? (
        <div
          className={`mb-6 grid gap-4 ${
            stats.length === 1
              ? "sm:grid-cols-1"
              : stats.length === 2
                ? "sm:grid-cols-2"
                : "sm:grid-cols-3"
          }`}
        >
          {stats}
        </div>
      ) : null}

      {showHourlyBudgetBar ? (
        <Card className="mb-6 px-5 py-4">
          <BudgetBar
            spent={budget.spentHours}
            total={budget.budgetHours}
            caption={`${budget.usedPercent}% of the purchased hours used`}
          />
        </Card>
      ) : null}

      {portal.approvals && stages.length > 0 ? (
        <Card className="mb-6">
          <CardHeader
            title="Approvals"
            description={
              decidable.some((a) => a.status === "PENDING")
                ? "Waiting on your decision"
                : "Where the project stands"
            }
          />

          <StageTrack stages={stages} />

          {decidable.length > 0 ? (
            <ul className="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
              {decidable.map((approval) => (
                <li key={approval.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium">
                      {approval.title}
                    </span>
                    <Badge color={approvalStatusColors[approval.status]}>
                      <Dot color={approvalStatusColors[approval.status]!} />
                      {approvalStatusLabels[approval.status]}
                    </Badge>
                    {portal.money && approval.amount ? (
                      <Badge>
                        {formatMoney(approval.amount, project.currency)}
                      </Badge>
                    ) : null}
                    {approval.dueDate && approval.status === "PENDING" ? (
                      <span className="text-[12px] text-[var(--color-muted)]">
                        respond by {formatDate(approval.dueDate)}
                      </span>
                    ) : null}
                  </div>

                  {approval.description ? (
                    <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
                      {approval.description}
                    </p>
                  ) : null}

                  {approval.attachments.length > 0 ? (
                    <div className="-mx-5 mt-2">
                      <AttachmentList
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

                  {approval.decidedAt ? (
                    <div className="mt-3 rounded-lg bg-[var(--color-surface-2)] px-3 py-2">
                      <p className="text-[12.5px] font-medium">
                        {approval.status === "APPROVED"
                          ? "Approved"
                          : "Changes requested"}{" "}
                        by {approval.decidedBy?.name ?? "—"},{" "}
                        {formatDateTime(approval.decidedAt)}
                      </p>
                      {approval.decisionNote ? (
                        <p className="mt-1 whitespace-pre-wrap text-[13px] text-[var(--color-ink-2)]">
                          {approval.decisionNote}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {approval.status === "PENDING" ? (
                    <div className="mt-3">
                      <DecisionForm approvalId={approval.id} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      {portal.docs && docs.length > 0 ? (
        <Card className="mb-6">
          <CardHeader
            title="Documents"
            description="Briefs and specifications shared with you"
          />
          <div className="divide-y divide-[var(--color-line)]">
            {docs.map((doc) => (
              <details key={doc.id} className="group px-5 py-3">
                <summary className="flex cursor-pointer items-center gap-2 text-[13.5px] font-medium">
                  <span className="flex-1">{doc.title}</span>
                  <span className="text-[11.5px] font-normal text-[var(--color-muted)]">
                    updated {formatDate(doc.updatedAt)}
                  </span>
                </summary>
                <div className="mt-3">
                  <Markdown>{doc.body}</Markdown>
                </div>
              </details>
            ))}
          </div>
        </Card>
      ) : null}

      {portal.description && project.description ? (
        <Card className="mb-6">
          <CardHeader title="About the project" />
          <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed">
            {project.description}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {portal.chat ? (
          <Card>
            <CardHeader
              title="Chat with your manager"
              description="Questions, feedback, approvals"
            />
            <ProjectChat
              projectId={id}
              currentUserId={user.id}
              canPostInternal={false}
              placeholder="Message your manager…"
              emptyMessage="No messages yet. Ask your project manager anything here: scope, timing, invoices."
              messages={messages.map((m) => ({
                id: m.id,
                body: m.body,
                createdAt: m.createdAt.toISOString(),
                isInternal: false,
                author: {
                  id: m.author.id,
                  name: m.author.name,
                  avatarColor: m.author.avatarColor,
                  role: m.author.role,
                },
              }))}
            />
          </Card>
        ) : null}

        <div className="space-y-6">
          {portal.tasks ? (
            <Card>
              <CardHeader title="Tasks" description="What we are working on" />
              {tickets.length === 0 ? (
                <EmptyState
                  title="No tasks published yet"
                  description="Your manager will share tasks once the work starts."
                />
              ) : (
                <ul className="divide-y divide-[var(--color-line)]">
                  {tickets.map((ticket) => (
                    <li
                      key={ticket.id}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <span className="min-w-0 flex-1 text-[13.5px]">
                        {ticket.title}
                      </span>
                      <Badge color={ticket.status.color}>
                        <Dot color={ticket.status.color} />
                        {ticket.status.name}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {portal.team ? (
            <Card>
              <CardHeader
                title="Your team"
                description={`${team.length} people from the studio`}
              />
              {team.length === 0 ? (
                <EmptyState title="Nobody assigned yet" />
              ) : (
                <ul className="divide-y divide-[var(--color-line)]">
                  {team.map((person) => (
                    <li
                      key={person.id}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <Avatar
                        name={person.name}
                        color={person.color}
                        size={28}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">
                          {person.name}
                        </p>
                        <p className="truncate text-[12px] text-[var(--color-muted)]">
                          {person.title}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {portal.files ? (
            <Card>
              <CardHeader
                title="Files"
                description="Designs, documents, assets"
              />
              <AttachmentList
                showUploader={false}
                items={files.map((file) => ({
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
              {portal.uploads ? (
                <div className="border-t border-[var(--color-line)] px-5 py-4">
                  <FileUpload
                    projectId={id}
                    showVisibilityToggle={false}
                    compact
                  />
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
