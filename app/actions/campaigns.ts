"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { getStudioSettings } from "@/lib/settings";
import { emailKey } from "@/lib/leads";
import { renderOutreach } from "@/lib/outreach-render";
import { unsubscribeUrl } from "@/lib/outreach-tokens";
import { recordTimeline } from "@/lib/timeline";
import type { ActionState } from "@/components/ui/form";

/**
 * Campaigns, and the one decision a person has to make before anything is
 * sent to anybody.
 *
 * `approveFirstTouchAction` is the gate. Until somebody has read the rendered
 * text of the first message against a named lead and pressed it, the enrolment
 * sits in `AWAITING_APPROVAL` and `lib/outreach-send.ts` will not claim it.
 * Every later touch in the sequence is a template that same person already
 * read; see the header of that file for why that is where the line is drawn.
 */

async function assertOutreach() {
  const user = await requireUser();
  if (!canConfigure(user))
    throw new Error("You don't have permission to do that");

  const settings = await getStudioSettings();
  if (!settings.outreachEnabled) throw new Error("Outreach is switched off");

  return user;
}

const campaignSchema = z.object({
  name: z.string().min(2, "Give the campaign a name").max(120),
  description: z.string().max(500).optional().nullable(),
  windowStartHour: z.number().int().min(0).max(23),
  windowEndHour: z.number().int().min(0).max(24),
  windowDays: z.string().max(40),
  timezone: z.string().min(1).max(60),
  dailyCap: z.number().int().min(1).max(500),
  minGapMinutes: z.number().int().min(0).max(1440),
  fromName: z.string().max(120).optional().nullable(),
});

function readCampaign(formData: FormData) {
  const num = (name: string, fallback: number) => {
    const raw = String(formData.get(name) ?? "").trim();
    return raw === "" ? fallback : Number(raw);
  };

  return {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    windowStartHour: num("windowStartHour", 9),
    windowEndHour: num("windowEndHour", 17),
    windowDays:
      formData
        .getAll("windowDays")
        .map((d) => String(d))
        .join(",") || "",
    timezone: String(formData.get("timezone") ?? "UTC").trim() || "UTC",
    dailyCap: num("dailyCap", 30),
    minGapMinutes: num("minGapMinutes", 6),
    fromName: String(formData.get("fromName") ?? "").trim() || null,
  };
}

export async function createCampaignAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertOutreach();

  const parsed = campaignSchema.safeParse(readCampaign(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  if (parsed.data.windowEndHour <= parsed.data.windowStartHour) {
    return { error: "The window has to end after it starts" };
  }

  const campaign = await prisma.campaign.create({
    data: { ...parsed.data, createdById: user.id },
  });

  revalidatePath("/outreach/campaigns");
  redirect(`/outreach/campaigns/${campaign.id}`);
}

export async function updateCampaignAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertOutreach();

  const id = String(formData.get("id"));
  const parsed = campaignSchema.safeParse(readCampaign(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  if (parsed.data.windowEndHour <= parsed.data.windowStartHour) {
    return { error: "The window has to end after it starts" };
  }

  await prisma.campaign.update({ where: { id }, data: parsed.data });

  revalidatePath(`/outreach/campaigns/${id}`);
  return { ok: true };
}

export async function deleteCampaignAction(formData: FormData) {
  await assertOutreach();

  const id = String(formData.get("id"));
  // Messages already sent survive: the foreign key is SET NULL, not CASCADE.
  // A record of something that went to a stranger has to outlive somebody
  // tidying up the campaign it came from.
  await prisma.campaign.delete({ where: { id } });

  revalidatePath("/outreach/campaigns");
  redirect("/outreach/campaigns");
}

const stepSchema = z.object({
  subject: z.string().min(3, "Give the message a subject").max(200),
  body: z.string().min(20, "Write the message — 20 characters at least").max(4000),
  delayDays: z.number().int().min(0).max(90),
});

export async function saveCampaignStepAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertOutreach();

  const campaignId = String(formData.get("campaignId"));
  const id = String(formData.get("id") ?? "") || null;

  const parsed = stepSchema.safeParse({
    subject: String(formData.get("subject") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim(),
    delayDays: Number(String(formData.get("delayDays") ?? "3")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  if (id) {
    await prisma.campaignStep.update({ where: { id }, data: parsed.data });
  } else {
    const last = await prisma.campaignStep.findFirst({
      where: { campaignId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    await prisma.campaignStep.create({
      data: {
        ...parsed.data,
        campaignId,
        position: (last?.position ?? 0) + 1,
      },
    });
  }

  revalidatePath(`/outreach/campaigns/${campaignId}`);
  return { ok: true };
}

export async function deleteCampaignStepAction(formData: FormData) {
  await assertOutreach();

  const id = String(formData.get("id"));
  const step = await prisma.campaignStep.findUnique({ where: { id } });
  if (!step) return;

  await prisma.campaignStep.delete({ where: { id } });

  revalidatePath(`/outreach/campaigns/${step.campaignId}`);
}

/**
 * Put leads into a campaign.
 *
 * Everything lands in `AWAITING_APPROVAL`, and the first message is written
 * out now so a person has something concrete to read. Nothing is scheduled:
 * `scheduledFor` stays null and the state stays `AWAITING_APPROVAL` until
 * somebody approves it.
 */
export async function enrolLeadsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertOutreach();

  const campaignId = String(formData.get("campaignId"));
  const status = String(formData.get("status") ?? "NEW");
  const limit = Math.min(500, Number(formData.get("limit") ?? 50) || 50);

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { steps: { orderBy: { position: "asc" }, take: 1 } },
  });
  if (!campaign) return { error: "Campaign not found" };

  const first = campaign.steps[0];
  if (!first) return { error: "Write the first message before enrolling anyone" };

  const candidates = await prisma.lead.findMany({
    where: {
      status: status === "ANY" ? undefined : (status as never),
      enrolments: { none: { campaignId } },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  if (candidates.length === 0) return { error: "No leads match that filter" };

  const blocked = await prisma.suppression.findMany({
    where: { emailKey: { in: candidates.map((l) => emailKey(l.email)) } },
    select: { emailKey: true },
  });
  const off = new Set(blocked.map((b) => b.emailKey));

  let enrolled = 0;
  let skipped = 0;

  for (const lead of candidates) {
    if (off.has(emailKey(lead.email))) {
      skipped += 1;
      continue;
    }

    const enrolment = await prisma.campaignEnrolment.create({
      data: { campaignId, leadId: lead.id },
    });

    await prisma.outreachMessage.create({
      data: {
        direction: "OUT",
        state: "AWAITING_APPROVAL",
        leadId: lead.id,
        campaignId,
        enrolmentId: enrolment.id,
        stepId: first.id,
        subject: first.subject,
        body: first.body,
      },
    });

    enrolled += 1;
  }

  revalidatePath(`/outreach/campaigns/${campaignId}`);
  return {
    ok: true,
    error:
      skipped > 0
        ? `${enrolled} enrolled. ${skipped} skipped — already on the suppression list.`
        : undefined,
  };
}

/**
 * The one decision that lets anything reach a stranger.
 *
 * The body is taken from the form rather than re-read from the template, so
 * what is scheduled is exactly the text that was on screen when the button was
 * pressed — including any edit made in the box.
 */
export async function approveFirstTouchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertOutreach();

  const id = String(formData.get("id"));
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (subject.length < 3) return { error: "The subject is too short" };
  if (body.length < 20) return { error: "The message is too short" };

  const message = await prisma.outreachMessage.findUnique({
    where: { id },
    include: { lead: true, enrolment: true },
  });
  if (!message || !message.lead || !message.enrolment) {
    return { error: "That message is gone" };
  }
  if (message.state !== "AWAITING_APPROVAL") {
    return { error: "That message has already been dealt with" };
  }

  const blocked = await prisma.suppression.findUnique({
    where: { emailKey: emailKey(message.lead.email) },
  });
  if (blocked) {
    return {
      error: "That address is on the suppression list and cannot be written to",
    };
  }

  const settings = await getStudioSettings();
  const rendered = renderOutreach({
    subject,
    body,
    lead: {
      name: message.lead.name,
      companyName: message.lead.companyName,
      sourceDetail: message.lead.sourceDetail,
    },
    studio: {
      signature: settings.outreachSignature,
      postalAddress: settings.outreachPostalAddress,
      unsubscribeUrl: unsubscribeUrl(message.lead.id),
    },
  });
  if (rendered.missing.length > 0) {
    return { error: `Cannot send yet: missing ${rendered.missing.join(", ")}` };
  }

  const now = new Date();

  await prisma.outreachMessage.update({
    where: { id },
    data: {
      subject,
      body,
      state: "SCHEDULED",
      scheduledFor: now,
      approvedById: user.id,
      approvedAt: now,
    },
  });

  await prisma.campaignEnrolment.update({
    where: { id: message.enrolment.id },
    data: { status: "ACTIVE", approvedById: user.id, approvedAt: now },
  });

  await recordTimeline({
    kind: "STATUS",
    summary: "First message approved for sending",
    userId: user.id,
    leadId: message.lead.id,
    campaignId: message.campaignId,
  });

  revalidatePath(`/outreach/campaigns/${message.campaignId}`);
  return { ok: true };
}

export async function discardFirstTouchAction(formData: FormData) {
  const user = await assertOutreach();

  const id = String(formData.get("id"));
  const message = await prisma.outreachMessage.findUnique({ where: { id } });
  if (!message) return;

  await prisma.outreachMessage.update({
    where: { id },
    data: { state: "CANCELLED", error: "Discarded before sending" },
  });

  if (message.enrolmentId) {
    await prisma.campaignEnrolment.update({
      where: { id: message.enrolmentId },
      data: {
        status: "STOPPED_BY_HAND",
        stoppedAt: new Date(),
        stoppedReason: "Discarded before the first message was sent",
      },
    });
  }

  if (message.leadId) {
    await recordTimeline({
      kind: "STATUS",
      summary: "First message discarded — nothing was sent",
      userId: user.id,
      leadId: message.leadId,
      campaignId: message.campaignId,
    });
  }

  revalidatePath(`/outreach/campaigns/${message.campaignId}`);
}

export async function setCampaignStatusAction(formData: FormData) {
  await assertOutreach();

  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as
    | "DRAFT"
    | "ACTIVE"
    | "PAUSED"
    | "FINISHED";

  if (status === "ACTIVE") {
    const steps = await prisma.campaignStep.count({ where: { campaignId: id } });
    if (steps === 0) return;
  }

  await prisma.campaign.update({ where: { id }, data: { status } });

  revalidatePath(`/outreach/campaigns/${id}`);
}

/** Stops one person's sequence, cancelling whatever was queued for them. */
export async function stopEnrolmentAction(formData: FormData) {
  const user = await assertOutreach();

  const id = String(formData.get("id"));
  const enrolment = await prisma.campaignEnrolment.findUnique({
    where: { id },
  });
  if (!enrolment) return;

  await prisma.campaignEnrolment.update({
    where: { id },
    data: {
      status: "STOPPED_BY_HAND",
      stoppedAt: new Date(),
      stoppedReason: "Stopped by hand",
    },
  });

  await prisma.outreachMessage.updateMany({
    where: {
      enrolmentId: id,
      state: { in: ["SCHEDULED", "AWAITING_APPROVAL", "DRAFT"] },
    },
    data: { state: "CANCELLED", error: "The sequence was stopped by hand" },
  });

  await recordTimeline({
    kind: "STATUS",
    summary: "Sequence stopped by hand",
    userId: user.id,
    leadId: enrolment.leadId,
    campaignId: enrolment.campaignId,
  });

  revalidatePath(`/outreach/campaigns/${enrolment.campaignId}`);
}
