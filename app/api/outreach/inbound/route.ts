import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { getStudioSettings } from "@/lib/settings";
import { emailKey, suppress } from "@/lib/leads";
import { recordTimeline } from "@/lib/timeline";
import {
  MAX_PAYLOAD_BYTES,
  deliveryId,
  detectProvider,
  normalise,
  readAddresses,
  readMessageIds,
  readReplyToken,
  verifyMailgun,
  verifyPostmark,
  verifySvix,
  wasTruncated,
  type InboundEvent,
} from "@/lib/outreach-inbound";

/**
 * `POST /api/outreach/inbound` — a reply, a bounce, or a complaint.
 *
 * Modelled on `app/api/git/webhook/route.ts`, including the replay guard,
 * which shares the same `WebhookDelivery` table with `outreach:` prefixed ids.
 *
 * **Threading, in three tiers, and the third one is a guess.**
 *
 * 1. The `+token` in the address we asked replies to go to. This is the only
 *    mechanism that survives clients which strip `References`, which is why
 *    the whole outreach subdomain has to be routed here.
 * 2. `In-Reply-To` and `References`, matched against the `Message-ID` we
 *    generated when sending.
 * 3. The From address. Ambiguous when somebody is in two campaigns, so the
 *    diary entry says the attribution was by address rather than by token —
 *    a reader deserves to know which of their records is a guess.
 *
 * **An inbound nobody can place does not create a lead.** It is stored with no
 * lead attached and shown at the top of the inbox. Writing a stranger into the
 * database because they emailed once would be exactly the silent write this
 * feature is otherwise careful to avoid.
 *
 * **Attachments are not stored.** `Attachment` requires an uploading `User`
 * with a cascading delete, and an inbound email has no uploader. They are
 * dropped, and the inbox says so rather than letting somebody assume a
 * contract came through.
 */
export const dynamic = "force-dynamic";

const OK = (body: object) =>
  Response.json(body, { headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const settings = await getStudioSettings();

  if (!settings.outreachEnabled || !settings.outreachInboundSecret) {
    return Response.json(
      { error: "disabled", message: "Inbound outreach mail is switched off" },
      { status: 404 },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return Response.json(
      { error: "too_large", message: "That payload is larger than we accept" },
      { status: 413 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "bad_json", message: "Body is not JSON" },
      { status: 400 },
    );
  }

  const provider = detectProvider(request.headers, payload);
  if (!provider) {
    return Response.json(
      {
        error: "unknown_provider",
        message: "Expected a Mailgun, Postmark or Svix payload",
      },
      { status: 400 },
    );
  }

  const secret = settings.outreachInboundSecret;
  const authentic =
    provider === "mailgun"
      ? verifyMailgun(payload, secret)
      : provider === "svix"
        ? verifySvix(raw, request.headers, secret)
        : verifyPostmark(
            new URL(request.url).searchParams.get("secret") ??
              request.headers.get("x-pm-secret"),
            secret,
          );

  if (!authentic) {
    return Response.json(
      { error: "bad_signature", message: "This did not verify" },
      { status: 401 },
    );
  }

  const event = normalise(provider, payload);
  if (!event) {
    return OK({ handled: false, reason: "nothing readable in this payload" });
  }

  const delivery = deliveryId(event, raw);
  const seen = await prisma.webhookDelivery.findUnique({
    where: { id: delivery },
  });
  if (seen) {
    return OK({ handled: false, reason: "already processed this delivery" });
  }
  await prisma.webhookDelivery.create({ data: { id: delivery } });

  const result = await apply(event);

  await prisma.studioSettings
    .update({
      where: { id: "default" },
      data: {
        outreachLastInboundAt: new Date(),
        outreachLastInboundInfo: `${provider}: ${event.kind} — ${result.outcome}`,
      },
    })
    .catch(() => {});

  return OK({ handled: true, kind: event.kind, ...result });
}

type Threaded = {
  lead: { id: string; email: string; status: string } | null;
  enrolmentId: string | null;
  campaignId: string | null;
  /** How it was matched, so the diary can admit when it was a guess. */
  by: "token" | "references" | "address" | "none";
};

async function thread(event: InboundEvent): Promise<Threaded> {
  const none: Threaded = {
    lead: null,
    enrolmentId: null,
    campaignId: null,
    by: "none",
  };

  const token = readReplyToken(event.toAddresses);
  if (token) {
    const sent = await prisma.outreachMessage.findUnique({
      where: { replyToken: token },
      include: { lead: true },
    });
    if (sent?.lead) {
      return {
        lead: sent.lead,
        enrolmentId: sent.enrolmentId,
        campaignId: sent.campaignId,
        by: "token",
      };
    }
  }

  const ids = readMessageIds(event.inReplyTo, event.referencesRaw);
  if (ids.length > 0) {
    const sent = await prisma.outreachMessage.findFirst({
      where: { rfcMessageId: { in: ids } },
      include: { lead: true },
    });
    if (sent?.lead) {
      return {
        lead: sent.lead,
        enrolmentId: sent.enrolmentId,
        campaignId: sent.campaignId,
        by: "references",
      };
    }
  }

  const from = event.fromEmail ?? readAddresses(event.fromEmail)[0] ?? null;
  if (!from) return none;

  const lead = await prisma.lead.findUnique({
    where: { emailKey: emailKey(from) },
  });
  if (!lead) return none;

  // Most recently contacted active enrolment. A guess when they are in two
  // campaigns, and the diary entry says so.
  const enrolment = await prisma.campaignEnrolment.findFirst({
    where: { leadId: lead.id, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });

  return {
    lead,
    enrolmentId: enrolment?.id ?? null,
    campaignId: enrolment?.campaignId ?? null,
    by: "address",
  };
}

async function apply(event: InboundEvent) {
  const { lead, enrolmentId, campaignId, by } = await thread(event);
  const now = new Date();

  // `rfcMessageId` is unique, and it exists to identify **our** outbound
  // messages so a reply can be threaded to one. An inbound carrying an id we
  // have already stored is not worth refusing the whole delivery over — a
  // provider that reports the same message twice under different event ids, or
  // a client that reuses one, would otherwise take this endpoint down. The
  // second copy is stored with the id left off; the reply token and the
  // References header are what threading actually runs on.
  const idTaken = event.rfcMessageId
    ? await prisma.outreachMessage.findUnique({
        where: { rfcMessageId: event.rfcMessageId },
        select: { id: true },
      })
    : null;

  const message = await prisma.outreachMessage.create({
    data: {
      direction: "IN",
      state: "SENT",
      leadId: lead?.id ?? null,
      campaignId,
      enrolmentId,
      fromEmail: event.fromEmail,
      toEmail: event.toAddresses[0] ?? null,
      subject: event.subject.slice(0, 200) || "(no subject)",
      body: event.body,
      truncated: wasTruncated(event.body),
      rfcMessageId: idTaken ? null : event.rfcMessageId,
      inReplyTo: event.inReplyTo,
      referencesRaw: event.referencesRaw,
      providerId: event.providerId,
    },
  });

  if (!lead) {
    // Deliberately no lead is created. It sits at the top of the inbox for
    // somebody to look at.
    return { outcome: "stored, but could not be placed", messageId: message.id };
  }

  const note =
    by === "address"
      ? "Matched by the address it came from rather than by the reply token, so this could be the wrong campaign."
      : null;

  if (event.kind === "reply") {
    await stop(enrolmentId, lead.id, "STOPPED_REPLIED", now);

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: "REPLIED",
        lastRepliedAt: now,
        replyCount: { increment: 1 },
      },
    });

    await recordTimeline({
      kind: "EMAIL_IN",
      summary: event.subject.slice(0, 200) || "They replied",
      body: [event.body, note].filter(Boolean).join("\n\n—\n"),
      actorKind: "CONTACT",
      leadId: lead.id,
      campaignId,
      messageId: message.id,
    });

    return { outcome: "reply recorded, sequence stopped", messageId: message.id };
  }

  if (event.kind === "hard_bounce" || event.kind === "complaint") {
    await suppress({
      email: lead.email,
      reason: event.kind === "complaint" ? "COMPLAINT" : "HARD_BOUNCE",
      source: `inbound: ${event.kind}`,
    });
    await stop(
      enrolmentId,
      lead.id,
      event.kind === "complaint" ? "STOPPED_UNSUBSCRIBED" : "STOPPED_BOUNCED",
      now,
    );
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: event.kind === "complaint" ? "UNSUBSCRIBED" : "BOUNCED",
        bounceCount: { increment: event.kind === "hard_bounce" ? 1 : 0 },
      },
    });

    await recordTimeline({
      kind: event.kind === "complaint" ? "COMPLAINT" : "BOUNCE",
      summary:
        event.kind === "complaint"
          ? "They marked it as spam — the address is now suppressed"
          : "The address does not exist — it is now suppressed",
      body: [event.body, note].filter(Boolean).join("\n\n—\n") || null,
      actorKind: "MACHINE",
      leadId: lead.id,
      campaignId,
      messageId: message.id,
    });

    return { outcome: "suppressed and stopped", messageId: message.id };
  }

  if (event.kind === "unsubscribe") {
    await suppress({
      email: lead.email,
      reason: "UNSUBSCRIBE",
      source: "inbound: provider unsubscribe",
    });
    await stop(enrolmentId, lead.id, "STOPPED_UNSUBSCRIBED", now);
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "UNSUBSCRIBED" },
    });

    await recordTimeline({
      kind: "UNSUBSCRIBE",
      summary: "Unsubscribed through the mail provider",
      actorKind: "CONTACT",
      leadId: lead.id,
      campaignId,
      messageId: message.id,
    });

    return { outcome: "suppressed", messageId: message.id };
  }

  if (event.kind === "soft_bounce") {
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: { bounceCount: { increment: 1 } },
    });

    // Three is the point at which "the mailbox was full for an afternoon"
    // stops being a plausible explanation.
    if (updated.bounceCount >= 3) {
      await suppress({
        email: lead.email,
        reason: "REPEATED_SOFT_BOUNCE",
        source: "inbound: three soft bounces",
      });
      await stop(enrolmentId, lead.id, "STOPPED_BOUNCED", now);
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "BOUNCED" },
      });
    }

    await recordTimeline({
      kind: "BOUNCE",
      summary:
        updated.bounceCount >= 3
          ? `Bounced ${updated.bounceCount} times — the address is now suppressed`
          : `Bounced (${updated.bounceCount} so far)`,
      actorKind: "MACHINE",
      leadId: lead.id,
      campaignId,
      messageId: message.id,
    });

    return {
      outcome: updated.bounceCount >= 3 ? "suppressed" : "counted",
      messageId: message.id,
    };
  }

  return { outcome: "stored", messageId: message.id };
}

/** Stops the sequence and cancels whatever was queued for that person. */
async function stop(
  enrolmentId: string | null,
  leadId: string,
  status:
    | "STOPPED_REPLIED"
    | "STOPPED_BOUNCED"
    | "STOPPED_UNSUBSCRIBED",
  now: Date,
) {
  if (enrolmentId) {
    await prisma.campaignEnrolment.update({
      where: { id: enrolmentId },
      data: { status, stoppedAt: now, stoppedReason: status },
    });
  }

  // Every queued message for this person, not only the one in this enrolment.
  // Somebody who replied to one campaign has not agreed to hear from another.
  await prisma.outreachMessage.updateMany({
    where: {
      leadId,
      direction: "OUT",
      state: { in: ["SCHEDULED", "AWAITING_APPROVAL", "DRAFT"] },
    },
    data: { state: "CANCELLED", error: `Stopped: ${status}` },
  });
}
