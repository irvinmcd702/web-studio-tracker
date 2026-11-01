import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, Building2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import {
  deleteRequestAction,
  promoteRequestClientAction,
} from "@/app/actions/requests";
import { requestStatusColors, requestStatusLabels } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import {
  Badge,
  Card,
  CardHeader,
  Dot,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { Button, buttonClass } from "@/components/ui/button";
import { FileUpload } from "@/components/project/file-upload";
import { RequestStatusForm } from "@/components/request/request-status-form";
import { AttachmentList } from "@/components/attachment/attachment-list";
import { Timeline } from "@/components/timeline/timeline";
import { readTimeline } from "@/lib/timeline";
import { SubmitButton } from "@/components/ui/form";
import { AiSuggestion } from "@/components/ui/ai-suggestion";
import { draftFromRequestAction } from "@/app/actions/ai";
import { aiAllowedForProject, aiStatus } from "@/lib/ai";
import { getStudioSettings } from "@/lib/settings";

export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;

  const request = await prisma.clientRequest.findUnique({
    where: { id },
    include: {
      client: true,
      owner: true,
      project: true,
      attachments: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: true },
      },
    },
  });
  if (!request) notFound();

  // An enquiry belongs to no project yet, so it follows the studio's default
  // answer for new projects; once converted, its project decides.
  const status = await aiStatus();
  const canDraft =
    status.usable &&
    (request.projectId
      ? await aiAllowedForProject(request.projectId)
      : (await getStudioSettings()).aiDefaultAllowed);

  const [owners, clients, entries] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "MANAGER", "MEMBER"] } },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
    }),
    readTimeline({ requestId: id }),
  ]);

  return (
    <>
      <PageHeader
        title={request.title}
        breadcrumb={
          <Link href="/requests" className="hover:underline">
            Requests
          </Link>
        }
        description={
          <span className="inline-flex items-center gap-2">
            <Badge color={requestStatusColors[request.status]}>
              <Dot color={requestStatusColors[request.status]!} />
              {requestStatusLabels[request.status]}
            </Badge>
            <span>
              {request.source ? `Source: ${request.source} · ` : ""}
              {formatDateTime(request.createdAt)}
            </span>
          </span>
        }
        action={
          request.project ? (
            <Link
              href={`/projects/${request.project.id}`}
              className={buttonClass("secondary", "md")}
            >
              Open project {request.project.key}
            </Link>
          ) : (
            <Link
              href={`/projects/new?requestId=${request.id}`}
              className={buttonClass("primary", "md")}
            >
              Create project from request
            </Link>
          )
        }
      />

      {request.createdByKind === "MACHINE" ? (
        <Card className="mb-6">
          <div className="flex items-start gap-2.5 px-5 py-4 text-[13px] leading-relaxed">
            <Bot
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--color-muted)]"
            />
            <p>
              <span className="font-medium">
                The tracker filed this from an outreach reply.
              </span>{" "}
              Nobody at the studio wrote it. The words below are a model&rsquo;s
              reading of what somebody sent back — the reply itself is in the
              history, and is the thing to check before answering.
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Project description" />
            <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed">
              {request.description}
            </div>
            {canDraft ? (
              <div className="border-t border-[var(--color-line)] px-5 py-4">
                <AiSuggestion
                  action={draftFromRequestAction}
                  fields={{ requestId: request.id }}
                  label="First cut at the work"
                  pendingText="Reading the enquiry…"
                  hint="Scope, tickets, and what to ask before quoting."
                />
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Contacts" />
            <dl className="grid gap-3 px-5 py-4 text-[13.5px] sm:grid-cols-2">
              <div>
                <dt className="text-[var(--color-muted)]">Contact name</dt>
                <dd className="mt-0.5 font-medium">
                  {request.contactName ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-muted)]">Company</dt>
                <dd className="mt-0.5 font-medium">
                  {request.companyName ?? request.client?.name ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-muted)]">Email</dt>
                <dd className="mt-0.5">
                  {request.contactEmail ? (
                    <a
                      href={`mailto:${request.contactEmail}`}
                      className="font-medium text-[var(--color-brand)] hover:underline"
                    >
                      {request.contactEmail}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-muted)]">Phone</dt>
                <dd className="mt-0.5 font-medium">
                  {request.contactPhone ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-muted)]">Ballpark budget</dt>
                <dd className="mt-0.5 font-medium">
                  {request.budgetNote ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-muted)]">Owner</dt>
                <dd className="mt-0.5 font-medium">
                  {request.owner?.name ?? "—"}
                </dd>
              </div>
            </dl>

            {!request.clientId ? (
              <div className="border-t border-[var(--color-line)] px-5 py-4">
                <form action={promoteRequestClientAction}>
                  <input type="hidden" name="id" value={request.id} />
                  <SubmitButton
                    size="sm"
                    variant="secondary"
                    pendingText="Saving…"
                  >
                    <Building2 size={14} />
                    Create a client record from these contacts
                  </SubmitButton>
                </form>
              </div>
            ) : (
              <div className="border-t border-[var(--color-line)] px-5 py-4 text-[13px]">
                Client:{" "}
                <Link
                  href={`/clients/${request.clientId}`}
                  className="font-medium text-[var(--color-brand)] hover:underline"
                >
                  {request.client?.name}
                </Link>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Attachments"
              description="Specs, briefs, examples — they move to the project on conversion"
            />
            <AttachmentList
              canManage
              items={request.attachments.map((file) => ({
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
            <div className="border-t border-[var(--color-line)] px-5 py-4">
              <FileUpload
                requestId={request.id}
                showVisibilityToggle={false}
                compact
              />
            </div>
          </Card>

          <Timeline
            entries={entries}
            target={{ requestId: request.id }}
            canAddNote
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Triage" />
            <div className="px-5 py-4">
              <RequestStatusForm
                requestId={request.id}
                status={request.status}
                ownerId={request.ownerId}
                clientId={request.clientId}
                locked={Boolean(request.projectId)}
                owners={owners.map((o) => ({ id: o.id, name: o.name }))}
                clients={clients.map((c) => ({ id: c.id, name: c.name }))}
              />
            </div>
          </Card>

          {canConfigure(user) ? (
            <Card className="border-[var(--color-danger-line)]">
              <CardHeader title="Delete" />
              <div className="px-5 py-4">
                <form action={deleteRequestAction}>
                  <input type="hidden" name="id" value={request.id} />
                  <Button type="submit" variant="danger" size="sm">
                    Delete request
                  </Button>
                </form>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
