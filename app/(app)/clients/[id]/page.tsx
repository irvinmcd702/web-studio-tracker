import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { deleteClientAction } from "@/app/actions/clients";
import {
  projectStatusColors,
  projectStatusLabels,
  requestStatusColors,
  requestStatusLabels,
} from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  Dot,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ClientForm } from "@/components/client/client-form";
import {
  InviteClientUserButton,
  ResendInviteButton,
} from "@/components/client/client-user-form";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Timeline } from "@/components/timeline/timeline";
import { readTimeline } from "@/lib/timeline";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      projects: { orderBy: { updatedAt: "desc" } },
      users: { orderBy: { createdAt: "asc" } },
      requests: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) notFound();

  const entries = await readTimeline({ clientId: client.id });

  return (
    <>
      <PageHeader
        title={client.name}
        breadcrumb={
          <Link href="/clients" className="hover:underline">
            Clients
          </Link>
        }
        description={
          [client.contactName, client.email, client.phone]
            .filter(Boolean)
            .join(" · ") || undefined
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title="Projects"
              description={`${client.projects.length} total`}
            />
            {client.projects.length === 0 ? (
              <EmptyState title="No projects" />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {client.projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/projects/${project.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-[var(--color-hover)]"
                    >
                      <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-ink-2)]">
                        {project.key}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                        {project.name}
                      </span>
                      <span className="text-[12px] text-[var(--color-muted)]">
                        {project.dueDate ? formatDate(project.dueDate) : ""}
                      </span>
                      <Badge color={projectStatusColors[project.status]}>
                        <Dot color={projectStatusColors[project.status]!} />
                        {projectStatusLabels[project.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Requests"
              description={`${client.requests.length} total`}
            />
            {client.requests.length === 0 ? (
              <EmptyState title="No requests" />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {client.requests.map((request) => (
                  <li key={request.id}>
                    <Link
                      href={`/requests/${request.id}`}
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-[var(--color-hover)]"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13.5px]">
                        {request.title}
                      </span>
                      <span className="text-[12px] text-[var(--color-muted)]">
                        {formatDate(request.createdAt)}
                      </span>
                      <Badge color={requestStatusColors[request.status]}>
                        {requestStatusLabels[request.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Portal access"
              description="Client users who can see projects and the chat"
              action={<InviteClientUserButton clientId={client.id} />}
            />
            {client.users.length === 0 ? (
              <EmptyState
                title="No portal accounts"
                description="Invite a contact so the client can sign in and talk to the PM."
              />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {client.users.map((portalUser) => {
                  // Never signed in and set a password of their own yet.
                  const pending = portalUser.passwordChangedAt === null;
                  return (
                    <li
                      key={portalUser.id}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      <Avatar
                        name={portalUser.name}
                        color={portalUser.avatarColor}
                        size={28}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium">
                          {portalUser.name}
                        </p>
                        <p className="text-[12px] text-[var(--color-muted)]">
                          {portalUser.email}
                        </p>
                      </div>
                      <Badge
                        color={
                          !portalUser.isActive
                            ? "#64748b"
                            : pending
                              ? "#d97706"
                              : "#16a34a"
                        }
                      >
                        {!portalUser.isActive
                          ? "disabled"
                          : pending
                            ? "invite pending"
                            : "active"}
                      </Badge>
                      <ResendInviteButton
                        userId={portalUser.id}
                        name={portalUser.name}
                        pending={pending}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Timeline
            entries={entries}
            target={{ clientId: client.id }}
            canAddNote
          />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-semibold">Client details</h2>
            <ClientForm
              mode="edit"
              values={{
                id: client.id,
                name: client.name,
                contactName: client.contactName,
                email: client.email,
                phone: client.phone,
                website: client.website,
                notes: client.notes,
              }}
            />
          </Card>

          <Card className="border-[var(--color-danger-line)]">
            <CardHeader title="Delete" />
            <div className="px-5 py-4">
              <form action={deleteClientAction}>
                <input type="hidden" name="id" value={client.id} />
                {client.projects.length > 0 ? (
                  <Button type="button" variant="danger" size="sm" disabled>
                    Delete client
                  </Button>
                ) : (
                  <ConfirmSubmit
                    question="Delete this client?"
                    confirmLabel="Delete client"
                  >
                    Delete client
                  </ConfirmSubmit>
                )}
              </form>
              <p className="mt-2 text-[12px] text-[var(--color-muted)]">
                {client.projects.length > 0
                  ? "Unlink the projects first."
                  : "Portal accounts are deleted too."}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
