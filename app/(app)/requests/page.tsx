import Link from "next/link";
import { Inbox } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { requestStatusColors, requestStatusLabels } from "@/lib/labels";
import { formatRelative } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Card,
  Dot,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { CreateRequestButton } from "@/components/request/create-request-button";

const TABS = [
  { value: "", label: "All" },
  { value: "NEW", label: "New" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "CONVERTED", label: "Converted" },
  { value: "REJECTED", label: "Rejected" },
];

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireStaff();
  const { status = "" } = await searchParams;

  const [requests, clients] = await Promise.all([
    prisma.clientRequest.findMany({
      where: status ? { status: status as never } : {},
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        client: true,
        owner: true,
        project: true,
        _count: { select: { attachments: true } },
      },
    }),
    prisma.client.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Client requests"
        description="Incoming inquiries that turn into projects"
        action={
          <>
            <Link
              href="/intake"
              target="_blank"
              className="text-[13px] font-medium text-[var(--color-brand)] hover:underline"
            >
              Public form ↗
            </Link>
            <CreateRequestButton
              clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1 w-fit">
        {TABS.map((tab) => (
          <Link
            key={tab.value || "all"}
            href={`/requests${tab.value ? `?status=${tab.value}` : ""}`}
            className={
              status === tab.value
                ? "rounded-md bg-[var(--color-brand-soft)] px-3 py-1.5 text-[13px] font-medium text-[var(--color-brand)]"
                : "rounded-md px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink-2)] transition hover:bg-[var(--color-hover-strong)]"
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden">
        {requests.length === 0 ? (
          <EmptyState
            icon={<Inbox size={30} />}
            title="No requests"
            description="Requests arrive through the public form or are added manually."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {requests.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/requests/${request.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-[var(--color-hover)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {request.title}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-muted)]">
                      {request.companyName ??
                        request.client?.name ??
                        "No company"}
                      {request.contactName ? ` · ${request.contactName}` : ""}
                      {request.budgetNote
                        ? ` · budget: ${request.budgetNote}`
                        : ""}
                      {request._count.attachments
                        ? ` · ${request._count.attachments} file(s)`
                        : ""}
                    </p>
                  </div>

                  {request.createdByKind === "MACHINE" ? (
                    <Badge color="#7c3aed">filed by the tracker</Badge>
                  ) : null}

                  {request.project ? (
                    <Badge color="#16a34a">project {request.project.key}</Badge>
                  ) : null}

                  <Badge color={requestStatusColors[request.status]}>
                    <Dot color={requestStatusColors[request.status]!} />
                    {requestStatusLabels[request.status]}
                  </Badge>

                  <span className="w-24 text-right text-[12px] text-[var(--color-muted)]">
                    {formatRelative(request.createdAt)}
                  </span>

                  {request.owner ? (
                    <Avatar
                      name={request.owner.name}
                      color={request.owner.avatarColor}
                      size={24}
                    />
                  ) : (
                    <span className="h-[26px] w-[26px] rounded-full border border-dashed border-[var(--color-line-strong)]" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
