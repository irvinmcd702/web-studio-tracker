import Link from "next/link";
import { Ban, Inbox, Send, Upload, Users } from "lucide-react";

import { prisma } from "@/lib/db";
import { getStudioSettings } from "@/lib/settings";
import { outreachBlockers, outreachQueue } from "@/lib/outreach-send";
import { formatDateTime } from "@/lib/utils";
import { leadStatusColors, leadStatusLabels } from "@/lib/labels";
import {
  Badge,
  Card,
  CardHeader,
  Dot,
  EmptyState,
  PageHeader,
  Stat,
} from "@/components/ui/primitives";
import { buttonClass } from "@/components/ui/button";

/**
 * Where outreach starts, and an honest account of what would happen next.
 *
 * The four numbers are the ones somebody actually needs before deciding
 * whether to touch anything: how many people are in the base, how many have
 * asked not to be written to, how many first messages nobody has read yet, and
 * how much is queued to go out in the next day.
 *
 * When something would stop a send — no postal address, no reply domain, no
 * outreach transport on the server — the page says which, rather than showing
 * a queue that will silently never move.
 */
export default async function OutreachPage() {
  const [leads, suppressed, byStatus, imports, queue, blocker, settings] =
    await Promise.all([
      prisma.lead.count(),
      prisma.suppression.count(),
      prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.leadImport.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { createdBy: { select: { name: true } } },
      }),
      outreachQueue(),
      outreachBlockers(),
      getStudioSettings(),
    ]);

  return (
    <>
      <PageHeader
        title="Outreach"
        description="People the studio has not spoken to yet, and who asked not to be written to"
        action={
          <>
            <Link
              href="/outreach/suppression"
              className={buttonClass("secondary", "md")}
            >
              <Ban size={14} />
              Suppression list
            </Link>
            <Link
              href="/outreach/leads/import"
              className={buttonClass("secondary", "md")}
            >
              <Upload size={14} />
              Import a list
            </Link>
            <Link
              href="/outreach/inbox"
              className={buttonClass("secondary", "md")}
            >
              <Inbox size={14} />
              Inbox
            </Link>
            <Link
              href="/outreach/campaigns"
              className={buttonClass("primary", "md")}
            >
              <Send size={14} />
              Campaigns
            </Link>
          </>
        }
      />

      {blocker ? (
        <Card className="mb-6 border-[var(--color-warn-line)]">
          <div className="px-5 py-4 text-[13px] leading-relaxed">
            <p className="font-medium">
              Nothing will send: {blocker.toLowerCase()}.
            </p>
            <p className="mt-1 text-[var(--color-muted)]">
              Everything else works — leads, imports and the suppression list.
              Messages approved now will sit scheduled until this is fixed.{" "}
              <Link
                href="/settings"
                className="text-[var(--color-brand)] underline"
              >
                Studio settings
              </Link>
            </p>
          </div>
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Leads" value={String(leads)} />
        <Stat label="Suppressed" value={String(suppressed)} />
        <Stat
          label="Waiting for approval"
          value={String(queue.awaitingApproval)}
          tone={queue.awaitingApproval > 0 ? "warn" : "default"}
        />
        <Stat
          label="Due in the next day"
          value={String(queue.dueSoon)}
          sub={
            queue.failed > 0
              ? `${queue.failed} failed and gave up`
              : `ceiling ${settings.outreachDailyCap} a day`
          }
          tone={queue.failed > 0 ? "danger" : "default"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title="The base"
              description="Where every lead currently stands"
              action={
                <Link
                  href="/outreach/leads"
                  className="text-[13px] font-medium text-[var(--color-brand)] hover:underline"
                >
                  Open the list
                </Link>
              }
            />
            {byStatus.length === 0 ? (
              <EmptyState
                icon={<Users size={30} />}
                title="No leads yet"
                description="Import a list or add somebody by hand. Either way you will be asked where the address came from."
              />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {byStatus.map((row) => (
                  <li
                    key={row.status}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <Badge color={leadStatusColors[row.status]}>
                      <Dot color={leadStatusColors[row.status]!} />
                      {leadStatusLabels[row.status]}
                    </Badge>
                    <Link
                      href={`/outreach/leads?status=${row.status}`}
                      className="ml-auto text-[13.5px] font-medium tabular-nums hover:underline"
                    >
                      {row._count._all}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Lists imported"
              description="What was uploaded, and what happened to every row in it"
            />
            {imports.length === 0 ? (
              <EmptyState title="Nothing imported yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {imports.map((record) => (
                  <li key={record.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className="text-[13.5px] font-medium">
                        {record.fileName}
                      </p>
                      <p className="text-[12px] text-[var(--color-muted)]">
                        {formatDateTime(record.createdAt)}
                        {record.createdBy ? ` · ${record.createdBy.name}` : ""}
                      </p>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
                      {record.sourceDetail}
                    </p>
                    <p className="mt-1 text-[12px] tabular-nums text-[var(--color-muted)]">
                      {record.imported} imported · {record.skippedDuplicate}{" "}
                      already known · {record.skippedSuppressed} suppressed ·{" "}
                      {record.skippedInvalid} unreadable
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="How this behaves" />
            <div className="space-y-3 px-5 py-4 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              <p className="flex items-start gap-2">
                <Send
                  size={14}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-[var(--color-muted)]"
                />
                <span>
                  <span className="font-medium text-[var(--color-ink)]">
                    A person approves the first message.
                  </span>{" "}
                  Nothing reaches anybody until somebody has read the rendered
                  text against a named lead and pressed Approve. Later messages
                  in a sequence are templates that same person wrote and saved
                  — the scheduler substitutes tokens and sends, and never
                  generates anything.
                </span>
              </p>
              <p>
                The scheduler runs every five minutes, which is the resolution
                of every send window and every gap between two messages. A
                campaign asking for a shorter gap gets five, and the campaign
                page says so.
              </p>
              <p>
                Suppression is re-checked at the moment of sending, not only
                when a message was queued. Somebody who unsubscribes today
                cancels a message scheduled last week.
              </p>
              <p>
                Whether a particular list may lawfully be written to is not a
                judgement this tracker makes. It records what you were told
                about where the rows came from so that judgement has facts
                under it.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
