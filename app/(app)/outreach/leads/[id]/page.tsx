import Link from "next/link";
import { notFound } from "next/navigation";
import { Ban, Download, Inbox } from "lucide-react";

import { prisma } from "@/lib/db";
import { emailKey } from "@/lib/leads";
import { readTimeline } from "@/lib/timeline";
import { unsubscribeUrl } from "@/lib/outreach-tokens";
import {
  leadSourceLabels,
  leadStatusColors,
  leadStatusLabels,
  suppressionReasonLabels,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import {
  Badge,
  Card,
  CardHeader,
  Dot,
  PageHeader,
} from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/form";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Timeline } from "@/components/timeline/timeline";
import { LeadForm } from "@/components/outreach/lead-form";
import { SuppressLeadButton } from "@/components/outreach/suppression-form";
import {
  deleteLeadAction,
  promoteLeadToRequestAction,
} from "@/app/actions/leads";

export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      import: { select: { fileName: true, createdAt: true } },
    },
  });
  if (!lead) notFound();

  const [entries, suppression] = await Promise.all([
    readTimeline({ leadId: id }),
    prisma.suppression.findUnique({
      where: { emailKey: emailKey(lead.email) },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={lead.name ?? lead.email}
        breadcrumb={
          <Link href="/outreach/leads" className="hover:underline">
            Leads
          </Link>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge color={leadStatusColors[lead.status]}>
              <Dot color={leadStatusColors[lead.status]!} />
              {leadStatusLabels[lead.status]}
            </Badge>
            <span>
              {lead.email}
              {lead.companyName ? ` · ${lead.companyName}` : ""}
            </span>
          </span>
        }
        action={
          <Link
            href={`/api/outreach/leads/${lead.id}/export`}
            className={buttonClass("secondary", "md")}
          >
            <Download size={14} />
            Export everything held
          </Link>
        }
      />

      {suppression ? (
        <Card className="mb-6 border-[var(--color-danger-line)]">
          <div className="flex items-start gap-2.5 px-5 py-4">
            <Ban
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[var(--color-danger)]"
            />
            <div className="text-[13px] leading-relaxed">
              <p className="font-medium">
                This address is on the suppression list —{" "}
                {suppressionReasonLabels[suppression.reason]?.toLowerCase() ??
                  suppression.reason}
                , {formatDateTime(suppression.createdAt)}.
              </p>
              <p className="mt-1 text-[var(--color-muted)]">
                Nothing will ever be sent to it. The row stays even if this lead
                is deleted, so a list imported later cannot put it back.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title="Where this address came from"
              description="What the studio was told, and what the first message would have to repeat back"
            />
            <dl className="grid gap-3 px-5 py-4 text-[13.5px] sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-[var(--color-muted)]">Source</dt>
                <dd className="mt-0.5 leading-relaxed">
                  {lead.sourceDetail ?? "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[var(--color-muted)]">
                  Why the studio believes it may write
                </dt>
                <dd className="mt-0.5 leading-relaxed">
                  {lead.consentNote ?? "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-muted)]">How it arrived</dt>
                <dd className="mt-0.5 font-medium">
                  {leadSourceLabels[lead.sourceKind]}
                  {lead.import ? ` — ${lead.import.fileName}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-muted)]">Added</dt>
                <dd className="mt-0.5 font-medium">
                  {formatDateTime(lead.createdAt)}
                </dd>
              </div>
            </dl>

            <div className="border-t border-[var(--color-line)] px-5 py-4">
              <p className="text-[12px] text-[var(--color-muted)]">
                Their unsubscribe link
              </p>
              <p className="mt-1 break-all font-mono text-[11.5px] text-[var(--color-ink-2)]">
                {unsubscribeUrl(lead.id)}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-muted)]">
                Derived from the server key rather than stored, so it is the
                same link in every message and stops working only if that key
                is rotated.
              </p>
            </div>
          </Card>

          <Timeline entries={entries} target={{ leadId: lead.id }} canAddNote />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-semibold">Details</h2>
            <LeadForm
              mode="edit"
              values={{
                id: lead.id,
                email: lead.email,
                name: lead.name,
                companyName: lead.companyName,
                title: lead.title,
                website: lead.website,
                phone: lead.phone,
                country: lead.country,
                sourceDetail: lead.sourceDetail,
                consentNote: lead.consentNote,
              }}
            />
          </Card>

          {lead.status !== "CONVERTED" ? (
            <Card>
              <CardHeader
                title="They are interested"
                description="Files a request in the same inbox the public form feeds"
              />
              <div className="px-5 py-4">
                <form action={promoteLeadToRequestAction}>
                  <input type="hidden" name="id" value={lead.id} />
                  <SubmitButton size="sm" variant="secondary" pendingText="Filing…">
                    <Inbox size={14} />
                    Turn into a request
                  </SubmitButton>
                </form>
              </div>
            </Card>
          ) : null}

          {!suppression ? (
            <Card>
              <CardHeader
                title="Do not write to them"
                description="Adds the address to the suppression list, for good"
              />
              <div className="px-5 py-4">
                <SuppressLeadButton email={lead.email} />
              </div>
            </Card>
          ) : null}

          <Card className="border-[var(--color-danger-line)]">
            <CardHeader title="Delete" />
            <div className="px-5 py-4">
              <form action={deleteLeadAction}>
                <input type="hidden" name="id" value={lead.id} />
                <ConfirmSubmit
                  question="Delete this lead?"
                  confirmLabel="Delete lead"
                >
                  Delete lead
                </ConfirmSubmit>
              </form>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-muted)]">
                The diary goes too. Any suppression stays — deleting it would
                mean writing to somebody who asked you not to.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
