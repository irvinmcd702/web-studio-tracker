import { randomBytes, randomUUID } from "crypto";

import { prisma } from "./db";
import { getStudioSettings } from "./settings";
import { emailKey } from "./leads";
import { isOutreachMailConfigured, sendOutreachMail } from "./mail";
import { renderOutreach } from "./outreach-render";
import { unsubscribeUrl } from "./outreach-tokens";
import { allowance, inZone, startOfLocalDay } from "./outreach-window";
import { recordTimeline } from "./timeline";

/**
 * Sending, on a schedule.
 *
 * ## Why this is allowed to send without a person present
 *
 * PRODUCT.md principle 6 says a model drafts and a person decides — never a
 * message to a client, never a silent write. The compromise this file
 * implements is not a weakening of that rule; it moves *where* the human reads
 * the text, and keeps the guarantee intact:
 *
 * - **Step one** is read, edited if need be, and approved by a named person
 *   against a named lead. That exact rendered text is what goes out.
 * - **Steps two onward are never drafted at send time.** The step's body is a
 *   template a person wrote and saved on the campaign. The only transformation
 *   here is mechanical token substitution in `lib/outreach-render.ts`. So the
 *   text a human read *is* the text that is sent; nothing new is generated
 *   with nobody watching.
 *
 * **Drafting step two with a model at send time is deliberately not
 * implemented.** That would be a model writing a message to a stranger with
 * nobody reading it, which is the thing principle 6 exists to forbid. If a
 * later change makes it look easy, this paragraph is the reason not to.
 *
 * ## What the tick guarantees
 *
 * Suppression is re-checked at send time, not only when the message was
 * scheduled. A message queued three days ago may be addressed to somebody who
 * unsubscribed yesterday, and that is the single most important correctness
 * rule in the whole subsystem.
 *
 * Nothing here throws out of the run. One bad address must not stop the
 * others, exactly as `runDailyDigest` never throws.
 */

/** How long a claim is honoured before another tick may take the row back. */
export const LEASE_MS = 10 * 60_000;

const MAX_ATTEMPTS = 3;

export type TickReport = {
  ok: boolean;
  skipped?: string;
  claimed: number;
  sent: number;
  failed: number;
  cancelledSuppressed: number;
  byCampaign: Record<string, number>;
};

const empty = (): TickReport => ({
  ok: true,
  claimed: 0,
  sent: 0,
  failed: 0,
  cancelledSuppressed: 0,
  byCampaign: {},
});

function backoffMs(attempts: number) {
  // 5, 25, then it gives up. Long enough for a greylisting server to relent.
  return Math.min(60, 5 * 5 ** (attempts - 1)) * 60_000;
}

function messageId(domain: string) {
  return `<${randomUUID()}@${domain}>`;
}

export function replyAddress(domain: string, token: string) {
  return `outreach+${token}@${domain}`;
}

/**
 * Everything the run needs to know that does not change per message.
 *
 * Returned as a refusal rather than thrown, so the cron endpoint can report
 * *why* nothing went out. "Nothing sent" and "nothing could have been sent"
 * are different answers and the settings page shows both.
 */
async function preflight() {
  const settings = await getStudioSettings();

  if (!settings.outreachEnabled) return { stop: "Outreach is switched off" };
  if (!isOutreachMailConfigured()) {
    return { stop: "Outreach mail is not configured on this server" };
  }
  if (!settings.outreachReplyDomain?.trim()) {
    return { stop: "No reply domain is set, so replies could not be threaded" };
  }
  if (!settings.outreachPostalAddress?.trim()) {
    // A commercial email without one is not a thing this tracker will put on
    // the wire, and saying so here beats sending something unlawful.
    return { stop: "No postal address is set for the studio" };
  }

  return { settings };
}

export async function runOutreachTick({
  now = new Date(),
  runId = randomUUID(),
}: { now?: Date; runId?: string } = {}): Promise<TickReport> {
  const report = empty();

  const pre = await preflight();
  if ("stop" in pre) return { ...report, skipped: pre.stop };
  const settings = pre.settings!;

  const domain = settings.outreachReplyDomain!.trim();

  // The studio-wide ceiling, counted across every campaign since midnight UTC.
  // Deliberately not per campaign timezone: it is one number about one
  // sending reputation, and the day it is counted over has to be one day.
  const sinceMidnight = new Date(now);
  sinceMidnight.setUTCHours(0, 0, 0, 0);
  const sentToday = await prisma.outreachMessage.count({
    where: { direction: "OUT", state: "SENT", sentAt: { gte: sinceMidnight } },
  });
  let studioRemaining = settings.outreachDailyCap - sentToday;
  if (studioRemaining <= 0) {
    return { ...report, skipped: "The studio's daily ceiling is used up" };
  }

  const campaigns = await prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

  for (const campaign of campaigns) {
    if (studioRemaining <= 0) break;

    const dayStart = startOfLocalDay(now, campaign.timezone);
    const [ownToday, last] = await Promise.all([
      prisma.outreachMessage.count({
        where: {
          campaignId: campaign.id,
          direction: "OUT",
          state: "SENT",
          sentAt: { gte: dayStart },
        },
      }),
      prisma.outreachMessage.findFirst({
        where: { campaignId: campaign.id, direction: "OUT", state: "SENT" },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true },
      }),
    ]);

    const budget = allowance({
      campaign,
      sentToday: ownToday,
      lastSentAt: last?.sentAt ?? null,
      studioRemaining,
      now,
    });
    if (budget <= 0) continue;

    const claimed = await claim(campaign.id, budget, now, runId);
    report.claimed += claimed.length;

    for (const message of claimed) {
      const outcome = await deliver(message, { now, domain, settings });

      if (outcome === "sent") {
        report.sent += 1;
        report.byCampaign[campaign.name] =
          (report.byCampaign[campaign.name] ?? 0) + 1;
        studioRemaining -= 1;
      } else if (outcome === "cancelled") {
        report.cancelledSuppressed += 1;
      } else if (outcome === "failed") {
        report.failed += 1;
      }

      // The gap is honoured within a tick as well as between ticks: claiming
      // three and posting them in the same second would defeat the point.
      if (outcome === "sent" && campaign.minGapMinutes > 0) break;
    }
  }

  await prisma.studioSettings
    .update({
      where: { id: "default" },
      data: {
        outreachLastTickAt: now,
        outreachLastTickInfo: `${report.sent} sent, ${report.failed} failed, ${report.cancelledSuppressed} cancelled`,
      },
    })
    // Bookkeeping must not undo a run that has already delivered mail.
    .catch(() => {});

  return report;
}

type Claimed = Awaited<ReturnType<typeof claim>>[number];

/**
 * Take rows for this tick, and only this tick.
 *
 * Prisma's `updateMany` has no `LIMIT`, so a naive update would claim the
 * whole table. This is select-then-compare-and-swap: the guard in the second
 * query's `where` is what makes it safe, because a second instance that read
 * the same ids finds them no longer `SCHEDULED` and updates zero rows.
 *
 * The documented deployment is a single instance, so this is belt and braces —
 * the same honest register as the note in `lib/api-rate-limit.ts`. If
 * throughput ever matters, `$queryRaw` with `FOR UPDATE SKIP LOCKED` is the
 * escape hatch; it is not needed at studio scale.
 */
async function claim(
  campaignId: string,
  budget: number,
  now: Date,
  runId: string,
) {
  const staleLease = new Date(now.getTime() - LEASE_MS);

  const claimable = {
    OR: [
      { state: "SCHEDULED" as const },
      // A crashed instance leaves rows in SENDING. Reclaim only once the
      // lease has expired, never sooner — the other one may be mid-SMTP.
      { state: "SENDING" as const, claimedAt: { lt: staleLease } },
    ],
  };

  const candidates = await prisma.outreachMessage.findMany({
    where: {
      campaignId,
      direction: "OUT",
      scheduledFor: { lte: now },
      ...claimable,
    },
    orderBy: { scheduledFor: "asc" },
    take: budget,
    select: { id: true },
  });
  if (candidates.length === 0) return [];

  await prisma.outreachMessage.updateMany({
    where: { id: { in: candidates.map((c) => c.id) }, ...claimable },
    data: {
      state: "SENDING",
      claimedAt: now,
      claimedBy: runId,
      attempts: { increment: 1 },
    },
  });

  return prisma.outreachMessage.findMany({
    where: { claimedBy: runId, state: "SENDING" },
    include: { lead: true, campaign: true, step: true, enrolment: true },
  });
}

async function deliver(
  message: Claimed,
  context: {
    now: Date;
    domain: string;
    settings: Awaited<ReturnType<typeof getStudioSettings>>;
  },
): Promise<"sent" | "cancelled" | "failed" | "retry"> {
  const { now, domain, settings } = context;
  const lead = message.lead;

  const cancel = async (reason: string) => {
    await prisma.outreachMessage.update({
      where: { id: message.id },
      data: { state: "CANCELLED", claimedBy: null, error: reason },
    });
  };

  if (!lead) {
    await cancel("The lead is gone");
    return "cancelled";
  }

  // **The rule everything else rests on.** Scheduled three days ago, and the
  // address may have unsubscribed yesterday.
  const blocked = await prisma.suppression.findUnique({
    where: { emailKey: emailKey(lead.email) },
  });
  if (blocked) {
    await cancel("The address is on the suppression list");
    await stopEnrolment(message.enrolmentId, "STOPPED_UNSUBSCRIBED", now);
    await recordTimeline({
      kind: "UNSUBSCRIBE",
      summary: "A scheduled message was cancelled — the address is suppressed",
      actorKind: "MACHINE",
      leadId: lead.id,
      campaignId: message.campaignId,
    });
    return "cancelled";
  }

  const enrolment = message.enrolment;
  if (!enrolment || enrolment.status !== "ACTIVE" || !enrolment.approvedAt) {
    await cancel("The enrolment is not active and approved");
    return "cancelled";
  }

  const rendered = renderOutreach({
    subject: message.subject,
    body: message.body,
    lead: {
      name: lead.name,
      companyName: lead.companyName,
      sourceDetail: lead.sourceDetail,
    },
    studio: {
      signature: settings.outreachSignature,
      postalAddress: settings.outreachPostalAddress,
      unsubscribeUrl: unsubscribeUrl(lead.id),
    },
  });

  if (rendered.missing.length > 0) {
    await cancel(`Not sendable: missing ${rendered.missing.join(", ")}`);
    return "cancelled";
  }

  const token = message.replyToken ?? randomBytes(12).toString("base64url");
  const rfcId = message.rfcMessageId ?? messageId(domain);
  const unsubscribe = unsubscribeUrl(lead.id);

  const result = await sendOutreachMail({
    to: lead.email,
    subject: rendered.subject,
    text: rendered.text,
    replyTo: replyAddress(domain, token),
    messageId: rfcId,
    headers: {
      // RFC 8058. The mailto is the fallback for clients that will not post.
      "List-Unsubscribe": `<mailto:unsubscribe@${domain}?subject=unsubscribe>, <${unsubscribe}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      Precedence: "bulk",
    },
  });

  if (!result.ok) {
    const giveUp = message.attempts >= MAX_ATTEMPTS;
    await prisma.outreachMessage.update({
      where: { id: message.id },
      data: giveUp
        ? {
            state: "FAILED",
            failedAt: now,
            claimedBy: null,
            error: result.error,
          }
        : {
            state: "SCHEDULED",
            claimedBy: null,
            claimedAt: null,
            error: result.error,
            scheduledFor: new Date(now.getTime() + backoffMs(message.attempts)),
          },
    });
    return giveUp ? "failed" : "retry";
  }

  await prisma.outreachMessage.update({
    where: { id: message.id },
    data: {
      state: "SENT",
      sentAt: now,
      claimedBy: null,
      claimedAt: null,
      error: null,
      replyToken: token,
      rfcMessageId: rfcId,
      toEmail: lead.email,
      // Stored as it actually left, footer and all.
      body: rendered.text,
      subject: rendered.subject,
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      lastContactedAt: now,
      status: lead.status === "NEW" ? "ACTIVE" : lead.status,
    },
  });

  await recordTimeline({
    kind: "EMAIL_OUT",
    summary: rendered.subject,
    body: rendered.text,
    actorKind: "MACHINE",
    leadId: lead.id,
    campaignId: message.campaignId,
    messageId: message.id,
  });

  await advance(enrolment.id, message.step?.position ?? 0, now);

  return "sent";
}

async function stopEnrolment(
  enrolmentId: string | null,
  status: "STOPPED_UNSUBSCRIBED" | "STOPPED_BY_HAND",
  now: Date,
) {
  if (!enrolmentId) return;
  await prisma.campaignEnrolment.update({
    where: { id: enrolmentId },
    data: { status, stoppedAt: now, stoppedReason: status },
  });
}

/**
 * Write the next step's message, or finish the enrolment.
 *
 * The next one is materialised only now, after this one actually went. That is
 * what keeps a five-touch sequence over five hundred leads at five hundred
 * rows rather than two and a half thousand, and what makes stopping a sequence
 * one row rather than four.
 */
async function advance(enrolmentId: string, justSent: number, now: Date) {
  const enrolment = await prisma.campaignEnrolment.findUnique({
    where: { id: enrolmentId },
    include: { campaign: { include: { steps: { orderBy: { position: "asc" } } } } },
  });
  if (!enrolment) return;

  const next = enrolment.campaign.steps.find((s) => s.position > justSent);

  await prisma.campaignEnrolment.update({
    where: { id: enrolmentId },
    data: {
      sentStep: justSent,
      ...(next ? {} : { status: "COMPLETED", stoppedAt: now }),
    },
  });

  if (!next) return;

  await prisma.outreachMessage.create({
    data: {
      direction: "OUT",
      state: "SCHEDULED",
      leadId: enrolment.leadId,
      campaignId: enrolment.campaignId,
      enrolmentId,
      stepId: next.id,
      subject: next.subject,
      body: next.body,
      // Days after this one actually went out, not after enrolment.
      scheduledFor: new Date(now.getTime() + next.delayDays * 86_400_000),
    },
  });
}

/** For the overview page: what the next tick would find waiting. */
export async function outreachQueue(now = new Date()) {
  const [awaitingApproval, dueSoon, failed] = await Promise.all([
    prisma.campaignEnrolment.count({ where: { status: "AWAITING_APPROVAL" } }),
    prisma.outreachMessage.count({
      where: {
        direction: "OUT",
        state: "SCHEDULED",
        scheduledFor: { lte: new Date(now.getTime() + 86_400_000) },
      },
    }),
    prisma.outreachMessage.count({ where: { state: "FAILED" } }),
  ]);

  return { awaitingApproval, dueSoon, failed };
}

/** Exported for the settings page and the tick report. */
export async function outreachBlockers() {
  const pre = await preflight();
  return "stop" in pre ? pre.stop! : null;
}

export { inZone };
