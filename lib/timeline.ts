import type { ActorKind, TimelineKind } from "@prisma/client";

import { prisma } from "./db";
import { requestStatusLabels } from "./labels";

/**
 * The diary kept against a client or a request.
 *
 * Two rules hold everywhere in this file and in everything that calls it:
 *
 * 1. **Entries are only ever added.** There is no update function here and no
 *    update path in the application, because a diary that can be edited
 *    afterwards stops being evidence of anything. A correction is a new entry
 *    that says what the earlier one got wrong.
 * 2. **Who wrote it is part of the entry.** `actorKind` separates a line a
 *    person typed from one the tracker filed and from one the other side of a
 *    conversation sent, so a reader is never left guessing which of the three
 *    they are looking at.
 *
 * It is a separate table from `Activity` on purpose — see the comment on the
 * model. This one is prose people keep; that one is an audit trail that gets
 * swept.
 */

/** What the page hands the component: one read, already done. */
export type TimelineEntries = Awaited<ReturnType<typeof readTimeline>>;

export type TimelineTarget = {
  clientId?: string | null;
  requestId?: string | null;
  leadId?: string | null;
  campaignId?: string | null;
  /** The message an entry is about, when there is one. */
  messageId?: string | null;
};

export async function recordTimeline(
  input: TimelineTarget & {
    kind: TimelineKind;
    summary: string;
    body?: string | null;
    actorKind?: ActorKind;
    userId?: string | null;
    isPinned?: boolean;
  },
) {
  return prisma.timelineEntry.create({
    data: {
      kind: input.kind,
      summary: input.summary,
      body: input.body ?? null,
      actorKind: input.actorKind ?? "HUMAN",
      userId: input.userId ?? null,
      isPinned: input.isPinned ?? false,
      clientId: input.clientId ?? null,
      requestId: input.requestId ?? null,
      leadId: input.leadId ?? null,
      campaignId: input.campaignId ?? null,
      messageId: input.messageId ?? null,
    },
  });
}

/**
 * Newest first, pinned above everything.
 *
 * `take` is here because a record that has been worked for two years has a
 * diary longer than anyone reads in one sitting, and the page that shows it
 * has other things on it.
 */
export async function readTimeline(
  target: TimelineTarget,
  { take = 50 }: { take?: number } = {},
) {
  if (
    !target.clientId &&
    !target.requestId &&
    !target.leadId &&
    !target.campaignId
  ) {
    return [];
  }

  return prisma.timelineEntry.findMany({
    where: {
      clientId: target.clientId ?? undefined,
      requestId: target.requestId ?? undefined,
      leadId: target.leadId ?? undefined,
      campaignId: target.campaignId ?? undefined,
    },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take,
    include: { user: { select: { name: true, avatarColor: true } } },
  });
}

/**
 * The sentence a status change leaves behind.
 *
 * The labels are resolved here and stored as text, for the same reason
 * `TicketStatusChange` copies `toStatusName`: renaming "In review" later must
 * not rewrite what happened last March.
 */
export function describeStatusChange(from: string, to: string) {
  const before = requestStatusLabels[from] ?? from;
  const after = requestStatusLabels[to] ?? to;
  return `Status: ${before} → ${after}`;
}
