"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { getStudioSettings } from "@/lib/settings";
import { draft } from "@/lib/ai";
import {
  outreachEmailPrompt,
  replyReadingPrompt,
  requestFromReplyPrompt,
} from "@/lib/ai-drafts";
import { readJson, readOneOf, readString } from "@/lib/ai-json";
import { emailKey } from "@/lib/leads";
import { sendOutreachMail } from "@/lib/mail";
import { renderOutreach } from "@/lib/outreach-render";
import { unsubscribeUrl } from "@/lib/outreach-tokens";
import { replyAddress } from "@/lib/outreach-send";
import { recordTimeline } from "@/lib/timeline";
import { notifyRequestCreated } from "@/lib/notify";
import type { ActionState } from "@/components/ui/form";

/**
 * Drafting for outreach.
 *
 * **A separate file from `app/actions/ai.ts` on purpose.** That one is about
 * the material of projects the studio is already working on, and every action
 * in it calls `canAccessProject`. This one is about people who never asked to
 * be contacted, behind a different switch. Mixing them is how a gate ends up
 * being checked in the wrong place.
 *
 * Every draft here has a separate "keep it" half, the same shape as
 * `draftAcceptanceAction`/`saveAcceptanceAction`. The one exception is
 * `proposeRequestFromReplyAction`, which writes by itself — see the note on it
 * for why that is defensible and where the fence is.
 */

async function assertOutreach() {
  const user = await requireUser();
  if (!canConfigure(user))
    throw new Error("You don't have permission to do that");

  const settings = await getStudioSettings();
  if (!settings.outreachEnabled) throw new Error("Outreach is switched off");

  return { user, settings };
}

export type DraftState = (ActionState & { text?: string }) | null;

/** A first cut at one message in a sequence. Writes nothing. */
export async function draftOutreachEmailAction(
  _prev: DraftState,
  formData: FormData,
): Promise<DraftState> {
  const { user, settings } = await assertOutreach();

  const stepId = String(formData.get("stepId") ?? "") || null;
  const campaignId = String(formData.get("campaignId"));

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!campaign) return { error: "Campaign not found" };

  const step = stepId ? campaign.steps.find((s) => s.id === stepId) : null;
  const position = step?.position ?? campaign.steps.length + 1;

  // A lead only to give the model something concrete about the audience. The
  // prompt builder is what decides which of these fields actually travel, and
  // the address and the name are not among them.
  const lead = await prisma.lead.findFirst({
    where: { enrolments: { some: { campaignId } } },
    orderBy: { createdAt: "asc" },
  });

  const { system, prompt } = outreachEmailPrompt({
    studioName: settings.studioLegalName?.trim() || "the studio",
    // The campaign's own description is the closest thing the tracker holds to
    // a statement of what the studio does for this audience. There is
    // deliberately no separate "about us" setting: one more box to fill in,
    // and a draft is only as good as what a person typed into it either way.
    studioBlurb: campaign.description,
    lead: {
      companyName: lead?.companyName ?? null,
      title: lead?.title ?? null,
      website: lead?.website ?? null,
      country: lead?.country ?? null,
      sourceDetail: lead?.sourceDetail ?? null,
    },
    step: position,
    purpose:
      String(formData.get("purpose") ?? "").trim() || campaign.description,
    priorSubjects: campaign.steps
      .filter((s) => s.position < position)
      .map((s) => s.subject),
  });

  const result = await draft({
    kind: "outreach_email",
    scope: "outreach",
    system,
    prompt,
    userId: user.id,
    leadId: lead?.id ?? null,
    maxTokens: 500,
  });

  return result.ok ? { ok: true, text: result.text } : { error: result.message };
}

const INTENTS = [
  "interested",
  "not_now",
  "not_interested",
  "unsubscribe",
  "out_of_office",
  "referral",
  "question",
  "unclear",
] as const;

export type ReadingState =
  | (ActionState & {
      intent?: (typeof INTENTS)[number];
      confidence?: "high" | "low";
      summary?: string;
      suggestedReply?: string;
      canFileRequest?: boolean;
    })
  | null;

/**
 * Reading one reply. Writes a diary entry saying what it thought, and nothing
 * else — no status changes, no suppression, no message.
 */
export async function readReplyAction(
  _prev: ReadingState,
  formData: FormData,
): Promise<ReadingState> {
  const { user } = await assertOutreach();

  const id = String(formData.get("id"));
  const inbound = await prisma.outreachMessage.findUnique({
    where: { id },
    include: { lead: true },
  });
  if (!inbound || inbound.direction !== "IN") return { error: "No such reply" };

  const ours = inbound.leadId
    ? await prisma.outreachMessage.findFirst({
        where: { leadId: inbound.leadId, direction: "OUT", state: "SENT" },
        orderBy: { sentAt: "desc" },
      })
    : null;

  const { system, prompt } = replyReadingPrompt({
    ourSubject: ours?.subject ?? "(not recorded)",
    ourBody: ours?.body ?? "(not recorded)",
    replyBody: inbound.body,
  });

  const result = await draft({
    kind: "reply_read",
    scope: "outreach",
    system,
    prompt,
    userId: user.id,
    leadId: inbound.leadId,
    maxTokens: 600,
  });
  if (!result.ok) return { error: result.message };

  const parsed = readJson<Record<string, unknown>>(result.text);
  if (!parsed.ok) return { error: parsed.error };

  const intent = readOneOf(parsed.value.intent, INTENTS) ?? "unclear";
  const confidence = readOneOf(parsed.value.confidence, ["high", "low"] as const) ?? "low";
  const summary = readString(parsed.value.summary, { max: 400 }) ?? "";
  const suggestedReply = readString(parsed.value.suggestedReply, { max: 2000 }) ?? "";

  if (inbound.leadId) {
    await recordTimeline({
      kind: "NOTE",
      summary: `Read as: ${intent.replace(/_/g, " ")} (${confidence} confidence)`,
      body: summary,
      actorKind: "MACHINE",
      leadId: inbound.leadId,
      messageId: inbound.id,
    });
  }

  return {
    ok: true,
    intent,
    confidence,
    summary,
    suggestedReply,
    // The fence for the one autonomous write. Below either bar, a person does
    // it or nobody does.
    canFileRequest: intent === "interested" && confidence === "high",
  };
}

/**
 * Sending a reply a person has read.
 *
 * The body comes from the submitted form rather than from anything stored, so
 * what goes out is exactly what was on screen when the button was pressed.
 */
export async function sendReplyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, settings } = await assertOutreach();

  const id = String(formData.get("id"));
  const body = String(formData.get("body") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();

  if (body.length < 10) return { error: "The reply is too short to send" };

  const inbound = await prisma.outreachMessage.findUnique({
    where: { id },
    include: { lead: true },
  });
  if (!inbound?.lead) return { error: "There is nobody to reply to" };

  const blocked = await prisma.suppression.findUnique({
    where: { emailKey: emailKey(inbound.lead.email) },
  });
  if (blocked) {
    return { error: "That address is on the suppression list" };
  }

  const domain = settings.outreachReplyDomain?.trim();
  if (!domain) return { error: "No reply domain is set in studio settings" };

  const rendered = renderOutreach({
    subject: subject || `Re: ${inbound.subject}`,
    body,
    lead: {
      name: inbound.lead.name,
      companyName: inbound.lead.companyName,
      sourceDetail: inbound.lead.sourceDetail,
    },
    studio: {
      signature: settings.outreachSignature,
      postalAddress: settings.outreachPostalAddress,
      unsubscribeUrl: unsubscribeUrl(inbound.lead.id),
    },
  });
  if (rendered.missing.length > 0) {
    return { error: `Cannot send: missing ${rendered.missing.join(", ")}` };
  }

  const token = inbound.replyToken ?? inbound.id;
  const sent = await sendOutreachMail({
    to: inbound.lead.email,
    subject: rendered.subject,
    text: rendered.text,
    replyTo: replyAddress(domain, token),
    // Threads the answer onto what they wrote, so it lands in the same
    // conversation in their client rather than as a fresh message.
    headers: inbound.rfcMessageId
      ? { "In-Reply-To": inbound.rfcMessageId, References: inbound.rfcMessageId }
      : undefined,
  });
  if (!sent.ok) return { error: sent.error };

  const now = new Date();
  await prisma.outreachMessage.create({
    data: {
      direction: "OUT",
      state: "SENT",
      leadId: inbound.leadId,
      campaignId: inbound.campaignId,
      subject: rendered.subject,
      body: rendered.text,
      toEmail: inbound.lead.email,
      sentAt: now,
      approvedById: user.id,
      approvedAt: now,
    },
  });

  await recordTimeline({
    kind: "EMAIL_OUT",
    summary: rendered.subject,
    body: rendered.text,
    userId: user.id,
    leadId: inbound.leadId,
    campaignId: inbound.campaignId,
  });

  revalidatePath("/outreach/inbox");
  revalidatePath(`/outreach/leads/${inbound.leadId}`);
  return { ok: true };
}

const requestSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(8000),
  budgetNote: z.string().max(200).nullable(),
});

/**
 * The one thing in this feature that writes without being asked twice.
 *
 * It creates a `ClientRequest` in status `NEW` — an internal row in the same
 * triage inbox the public intake form feeds. Nothing leaves the building, and
 * the fences are:
 *
 * - only when the reading came back `interested` **and** `high` confidence;
 * - the same `requestSchema` staff go through, so a malformed answer fails
 *   closed rather than creating a half-filled row;
 * - `createdByKind: MACHINE`, shown as a badge wherever the request appears,
 *   so nobody mistakes it for something a colleague wrote;
 * - a diary entry on both the lead and the request.
 *
 * Anything below the bar leaves a diary line saying what the model thought and
 * stops there.
 */
export async function proposeRequestFromReplyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await assertOutreach();

  const id = String(formData.get("id"));
  const inbound = await prisma.outreachMessage.findUnique({
    where: { id },
    include: { lead: true },
  });
  if (!inbound?.lead) return { error: "There is nobody to file this for" };

  const existing = await prisma.clientRequest.findFirst({
    where: { leadId: inbound.leadId },
  });
  if (existing) return { error: "A request has already been filed for them" };

  const ours = await prisma.outreachMessage.findFirst({
    where: { leadId: inbound.leadId, direction: "OUT", state: "SENT" },
    orderBy: { sentAt: "desc" },
  });

  const { system, prompt } = requestFromReplyPrompt({
    companyName: inbound.lead.companyName,
    ourSubject: ours?.subject ?? "(not recorded)",
    replyBody: inbound.body,
  });

  const result = await draft({
    kind: "request_from_reply",
    scope: "outreach",
    system,
    prompt,
    userId: user.id,
    leadId: inbound.leadId,
    maxTokens: 700,
  });
  if (!result.ok) return { error: result.message };

  const parsed = readJson<Record<string, unknown>>(result.text);
  if (!parsed.ok) return { error: parsed.error };

  const checked = requestSchema.safeParse({
    title: readString(parsed.value.title, { max: 200 }) ?? "",
    description: readString(parsed.value.description) ?? "",
    budgetNote: readString(parsed.value.budgetNote, { max: 200 }),
  });
  if (!checked.success) {
    return {
      error: `The model's answer would not make a usable request: ${checked.error.issues[0]!.message}`,
    };
  }

  const request = await prisma.clientRequest.create({
    data: {
      ...checked.data,
      status: "NEW",
      source: "Outreach reply",
      createdByKind: "MACHINE",
      leadId: inbound.leadId,
      contactName: inbound.lead.name,
      contactEmail: inbound.lead.email,
      contactPhone: inbound.lead.phone,
      companyName: inbound.lead.companyName,
    },
  });

  await prisma.lead.update({
    where: { id: inbound.leadId! },
    data: { status: "CONVERTED" },
  });

  await recordTimeline({
    kind: "SYSTEM",
    summary: `Filed as the request "${request.title}"`,
    actorKind: "MACHINE",
    leadId: inbound.leadId,
    messageId: inbound.id,
  });
  await recordTimeline({
    kind: "SYSTEM",
    summary: "Filed by the tracker from an outreach reply",
    body: inbound.body.slice(0, 2000),
    actorKind: "MACHINE",
    requestId: request.id,
  });

  // The same channel the intake form feeds, so it is not a quieter arrival
  // than one a person filled in.
  await notifyRequestCreated(request);

  revalidatePath("/requests");
  revalidatePath("/outreach/inbox");
  return { ok: true };
}
