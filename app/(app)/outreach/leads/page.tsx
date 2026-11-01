import Link from "next/link";
import { Users } from "lucide-react";

import { prisma } from "@/lib/db";
import {
  leadSourceLabels,
  leadStatusColors,
  leadStatusLabels,
} from "@/lib/labels";
import { formatRelative } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Card,
  Dot,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { CreateLeadButton } from "@/components/outreach/lead-form";

const TABS = [
  { value: "", label: "All" },
  { value: "NEW", label: "New" },
  { value: "ACTIVE", label: "Being written to" },
  { value: "REPLIED", label: "Replied" },
  { value: "CONVERTED", label: "Became a request" },
  { value: "UNSUBSCRIBED", label: "Unsubscribed" },
  { value: "DISQUALIFIED", label: "Not a fit" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "" } = await searchParams;

  const leads = await prisma.lead.findMany({
    where: status ? { status: status as never } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { owner: { select: { name: true, avatarColor: true } } },
  });

  return (
    <>
      <PageHeader
        title="Leads"
        breadcrumb={
          <Link href="/outreach" className="hover:underline">
            Outreach
          </Link>
        }
        description="People the studio has not spoken to yet"
        action={
          <>
            <Link
              href="/outreach/leads/import"
              className={buttonClass("secondary", "md")}
            >
              Import a list
            </Link>
            <CreateLeadButton />
          </>
        }
      />

      <div className="mb-4 flex w-fit flex-wrap gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.value || "all"}
            href={`/outreach/leads${tab.value ? `?status=${tab.value}` : ""}`}
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
        {leads.length === 0 ? (
          <EmptyState
            icon={<Users size={30} />}
            title="No leads here"
            description="Import a list or add somebody by hand. Either way you will be asked where the address came from."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {leads.map((lead) => (
              <li key={lead.id}>
                <Link
                  href={`/outreach/leads/${lead.id}`}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-[var(--color-hover)]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {lead.name ?? lead.email}
                    </p>
                    <p className="mt-0.5 truncate text-[12.5px] text-[var(--color-muted)]">
                      {lead.name ? `${lead.email} · ` : ""}
                      {lead.companyName ?? "No company"}
                      {lead.title ? ` · ${lead.title}` : ""}
                    </p>
                  </div>

                  <span className="hidden text-[12px] text-[var(--color-muted)] sm:inline">
                    {leadSourceLabels[lead.sourceKind]}
                  </span>

                  <Badge color={leadStatusColors[lead.status]}>
                    <Dot color={leadStatusColors[lead.status]!} />
                    {leadStatusLabels[lead.status]}
                  </Badge>

                  <span className="w-24 text-right text-[12px] text-[var(--color-muted)]">
                    {formatRelative(lead.createdAt)}
                  </span>

                  {lead.owner ? (
                    <Avatar
                      name={lead.owner.name}
                      color={lead.owner.avatarColor}
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

      {leads.length === 300 ? (
        <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">
          Showing the 300 most recent. Filter by status to see further back.
        </p>
      ) : null}
    </>
  );
}
