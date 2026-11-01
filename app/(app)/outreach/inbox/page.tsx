import Link from "next/link";
import { Inbox, TriangleAlert } from "lucide-react";

import { prisma } from "@/lib/db";
import { formatDateTime, formatRelative } from "@/lib/utils";
import {
  Badge,
  Card,
  CardHeader,
  Dot,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { leadStatusColors, leadStatusLabels } from "@/lib/labels";
import { aiStatus } from "@/lib/ai";
import { ReplyReader } from "@/components/outreach/reply-reader";

/**
 * What came back.
 *
 * Unplaceable messages sit at the top rather than at the bottom, because they
 * are the ones that need a human: somebody wrote to the studio and the tracker
 * could not work out who they were. Everything below is already filed against
 * a lead and can be read there.
 */
export default async function OutreachInboxPage() {
  const [unplaced, placed, ai] = await Promise.all([
    prisma.outreachMessage.findMany({
      where: { direction: "IN", leadId: null },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.outreachMessage.findMany({
      where: { direction: "IN", leadId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        lead: { select: { id: true, name: true, email: true, status: true } },
        campaign: { select: { id: true, name: true } },
      },
    }),
    aiStatus(),
  ]);

  return (
    <>
      <PageHeader
        title="Inbox"
        breadcrumb={
          <Link href="/outreach" className="hover:underline">
            Outreach
          </Link>
        }
        description="Replies, bounces and complaints, as the mail provider reported them"
      />

      <div className="space-y-6">
        {unplaced.length > 0 ? (
          <Card className="border-[var(--color-warn-line)]">
            <CardHeader
              title="Could not place these"
              description="Somebody wrote and the tracker could not work out who — no reply token, no matching thread, no lead with that address"
            />
            <ul className="divide-y divide-[var(--color-line)]">
              {unplaced.map((message) => (
                <li key={message.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <TriangleAlert
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-[var(--color-warn)]"
                    />
                    <p className="text-[13.5px] font-medium">
                      {message.fromEmail ?? "an unknown sender"}
                    </p>
                    <p className="text-[12px] text-[var(--color-muted)]">
                      {formatDateTime(message.createdAt)}
                    </p>
                  </div>
                  <p className="mt-1 text-[13px] font-medium">
                    {message.subject}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-ink-2)]">
                    {message.body.slice(0, 600)}
                    {message.body.length > 600 ? "…" : ""}
                  </p>
                  <p className="mt-2 text-[12px] text-[var(--color-muted)]">
                    No lead was created from this. Add them by hand if they
                    should be in the base.
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Everything that came back"
            description={placed.length ? `${placed.length} messages` : undefined}
          />
          {placed.length === 0 ? (
            <EmptyState
              icon={<Inbox size={30} />}
              title="Nothing has come back yet"
              description="Replies, bounces and complaints appear here once the mail provider is posting to the inbound webhook."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-line)]">
              {placed.map((message) => (
                <li key={message.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/outreach/leads/${message.lead!.id}`}
                      className="text-[13.5px] font-medium text-[var(--color-brand)] hover:underline"
                    >
                      {message.lead!.name ?? message.lead!.email}
                    </Link>
                    <Badge color={leadStatusColors[message.lead!.status]}>
                      <Dot color={leadStatusColors[message.lead!.status]!} />
                      {leadStatusLabels[message.lead!.status]}
                    </Badge>
                    <span className="ml-auto text-[12px] text-[var(--color-muted)]">
                      {message.campaign ? `${message.campaign.name} · ` : ""}
                      {formatRelative(message.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] font-medium">
                    {message.subject}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-ink-2)]">
                    {message.body.slice(0, 400)}
                    {message.body.length > 400 ? "…" : ""}
                  </p>
                  {message.truncated ? (
                    <p className="mt-1 text-[12px] text-[var(--color-muted)]">
                      The quoted thread below this was cut.
                    </p>
                  ) : null}
                  {ai.outreachAllowed ? (
                    <ReplyReader
                      messageId={message.id}
                      subject={message.subject}
                      hasLead
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-[var(--color-line)] px-5 py-3.5 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
            Attachments on inbound messages are not stored. If somebody sends a
            brief as a file, it is in the mailbox at your provider and not here.
          </div>
        </Card>
      </div>
    </>
  );
}
