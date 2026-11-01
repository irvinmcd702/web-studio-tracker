import { prisma } from "./db";
import { getStudioSettings } from "./settings";

/**
 * Throwing things away on a schedule.
 *
 * Two kinds of period, and the difference is the whole design:
 *
 * **Fixed**, for tables that exist to make the software work — sign-in
 * counters, spent one-time links, webhook delivery ids. Nobody has a reason to
 * keep them and nobody should have to decide, so they are not configurable.
 *
 * **Chosen**, for the studio's own history — the activity feed, client chat,
 * model usage. These have real value and real risk, and how long to keep them
 * is a judgement about the business, not about the code. So they default to
 * **zero, which keeps them forever**, and the settings page says plainly that
 * leaving it there is itself a decision.
 *
 * Nothing here touches a project, a ticket, a work log or a file. Those are
 * the record of what was done and what was billed; deleting them on a timer
 * would be destroying accounts, not minimising data.
 *
 * **`Suppression` is never swept, by anything, ever.** It is not in the fixed
 * list and it will never get a chosen period, because every row in it is
 * somebody who asked not to be written to. Deleting one does not minimise
 * data; it re-permits mail to a person who said no. There is a test asserting
 * exactly this, and it is there to fail loudly if a future period is added
 * that happens to catch the table.
 */

const DAY = 86_400_000;

/** Long enough for the sliding window and the lockout to have expired twice. */
const LOGIN_ATTEMPT_HOURS = 24;
/** A one-time link that is spent or expired has nothing left to prove. */
const SPENT_TOKEN_DAYS = 30;
/** Far longer than any forge retries a delivery for. */
const WEBHOOK_DAYS = 7;

export type RetentionCounts = {
  loginAttempts: number;
  authTokens: number;
  webhookDeliveries: number;
  activity: number;
  chatMessages: number;
  aiUsage: number;
  meetings: number;
  outreachMessages: number;
};

export type RetentionRules = {
  retainActivityDays: number;
  retainChatDays: number;
  retainAiUsageDays: number;
  retainMeetingDays: number;
  retainOutreachDays: number;
};

const empty = (): RetentionCounts => ({
  loginAttempts: 0,
  authTokens: 0,
  webhookDeliveries: 0,
  activity: 0,
  chatMessages: 0,
  aiUsage: 0,
  meetings: 0,
  outreachMessages: 0,
});

function cutoff(now: Date, days: number) {
  return new Date(now.getTime() - days * DAY);
}

/**
 * What the next sweep would remove, without removing it.
 *
 * Offered because "keep client chat for 90 days" is the kind of setting whose
 * consequences you want to see before you save it, not after.
 */
export async function previewRetention({
  now = new Date(),
  rules,
}: { now?: Date; rules?: RetentionRules } = {}): Promise<RetentionCounts> {
  const settings = rules ?? (await getStudioSettings());
  const counts = empty();

  counts.loginAttempts = await prisma.loginAttempt.count({
    where: {
      updatedAt: {
        lt: new Date(now.getTime() - LOGIN_ATTEMPT_HOURS * 3_600_000),
      },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
  });

  counts.authTokens = await prisma.authToken.count({
    where: { expiresAt: { lt: cutoff(now, SPENT_TOKEN_DAYS) } },
  });

  counts.webhookDeliveries = await prisma.webhookDelivery.count({
    where: { receivedAt: { lt: cutoff(now, WEBHOOK_DAYS) } },
  });

  if (settings.retainActivityDays > 0) {
    counts.activity = await prisma.activity.count({
      where: { createdAt: { lt: cutoff(now, settings.retainActivityDays) } },
    });
  }

  if (settings.retainChatDays > 0) {
    counts.chatMessages = await prisma.chatMessage.count({
      where: { createdAt: { lt: cutoff(now, settings.retainChatDays) } },
    });
  }

  if (settings.retainAiUsageDays > 0) {
    counts.aiUsage = await prisma.aiUsage.count({
      where: { createdAt: { lt: cutoff(now, settings.retainAiUsageDays) } },
    });
  }

  // Dated by when the meeting happened, not when somebody filed it: a call
  // uploaded late is still that old, and the point is how long speech is kept.
  if (settings.retainMeetingDays > 0) {
    counts.meetings = await prisma.meeting.count({
      where: { heldAt: { lt: cutoff(now, settings.retainMeetingDays) } },
    });
  }

  // The bodies of outreach messages. Not the leads, and emphatically not
  // `Suppression` — see the note at the top of this file.
  if (settings.retainOutreachDays > 0) {
    counts.outreachMessages = await prisma.outreachMessage.count({
      where: { createdAt: { lt: cutoff(now, settings.retainOutreachDays) } },
    });
  }

  return counts;
}

export async function runRetentionSweep({
  now = new Date(),
  rules,
}: { now?: Date; rules?: RetentionRules } = {}): Promise<RetentionCounts> {
  const settings = rules ?? (await getStudioSettings());
  const counts = empty();

  // A counter that is past its window and not currently holding anyone out has
  // nothing left to say. Rows still enforcing a lockout are left alone.
  counts.loginAttempts = (
    await prisma.loginAttempt.deleteMany({
      where: {
        updatedAt: {
          lt: new Date(now.getTime() - LOGIN_ATTEMPT_HOURS * 3_600_000),
        },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
    })
  ).count;

  counts.authTokens = (
    await prisma.authToken.deleteMany({
      where: { expiresAt: { lt: cutoff(now, SPENT_TOKEN_DAYS) } },
    })
  ).count;

  // Also swept opportunistically by the webhook route, so an instance running
  // without cron still clears them. Deleting twice costs nothing.
  counts.webhookDeliveries = (
    await prisma.webhookDelivery.deleteMany({
      where: { receivedAt: { lt: cutoff(now, WEBHOOK_DAYS) } },
    })
  ).count;

  if (settings.retainActivityDays > 0) {
    counts.activity = (
      await prisma.activity.deleteMany({
        where: { createdAt: { lt: cutoff(now, settings.retainActivityDays) } },
      })
    ).count;
  }

  if (settings.retainChatDays > 0) {
    counts.chatMessages = (
      await prisma.chatMessage.deleteMany({
        where: { createdAt: { lt: cutoff(now, settings.retainChatDays) } },
      })
    ).count;
  }

  if (settings.retainAiUsageDays > 0) {
    counts.aiUsage = (
      await prisma.aiUsage.deleteMany({
        where: { createdAt: { lt: cutoff(now, settings.retainAiUsageDays) } },
      })
    ).count;
  }

  // The transcript goes; tickets made from it stay, with their provenance
  // pointing at nothing. Work that was agreed does not evaporate because the
  // recording of agreeing it reached its date.
  if (settings.retainMeetingDays > 0) {
    counts.meetings = (
      await prisma.meeting.deleteMany({
        where: { heldAt: { lt: cutoff(now, settings.retainMeetingDays) } },
      })
    ).count;
  }

  // The message bodies go; the diary line saying one was sent stays, with its
  // `messageId` pointing at nothing. That somebody was written to on a date is
  // the fact worth keeping longest, and it is also the fact a complaint turns
  // on. The lead row is not touched, and `Suppression` is not touched by
  // anything, ever.
  if (settings.retainOutreachDays > 0) {
    counts.outreachMessages = (
      await prisma.outreachMessage.deleteMany({
        where: { createdAt: { lt: cutoff(now, settings.retainOutreachDays) } },
      })
    ).count;
  }

  await prisma.studioSettings
    .update({
      where: { id: "default" },
      data: {
        retentionLastRunAt: now,
        retentionLastInfo: describeRetention(counts),
      },
    })
    .catch(() => {
      // Bookkeeping must not undo a sweep that already ran.
    });

  return counts;
}

export function describeRetention(counts: RetentionCounts) {
  const removed = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(
      ([what, n]) => `${n} ${what.replace(/([A-Z])/g, " $1").toLowerCase()}`,
    );

  return removed.length ? `Removed ${removed.join(", ")}` : "Nothing to remove";
}
