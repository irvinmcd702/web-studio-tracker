"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { readPortalValues } from "@/lib/portal";
import { appUrl, normaliseChannel, postToWebhook } from "@/lib/rocketchat";
import { getStudioSettings, saveDefaultPortalValues } from "@/lib/settings";
import { collectSignals, signalsFor } from "@/lib/attention";
import { renderPersonalDigest } from "@/lib/digest";
import {
  isMailConfigured,
  sendMail,
  sendOutreachMail,
  verifyOutreachMail,
} from "@/lib/mail";
import { isAiConfigured } from "@/lib/ai";
import { describeRetention, previewRetention } from "@/lib/retention";
import type { ActionState } from "@/components/ui/form";

type GitState = (NonNullable<ActionState> & { secret?: string }) | null;

const EVENT_FLAGS = [
  "notifyRequestCreated",
  "notifyClientMessage",
  "notifyProjectCreated",
  "notifyTicketAssigned",
  "notifyTicketStatusChanged",
  "notifyBudgetThreshold",
  "notifyApprovalDecision",
] as const;

export async function updateRocketChatAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canConfigure(user)) {
    return { error: "You don't have permission to change studio settings" };
  }

  const enabled = formData.get("rocketChatEnabled") === "on";
  const submittedUrl = String(
    formData.get("rocketChatWebhookUrl") ?? "",
  ).trim();
  const channel = normaliseChannel(
    String(formData.get("rocketChatDefaultChannel") ?? ""),
  );

  if (submittedUrl) {
    try {
      const parsed = new URL(submittedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("bad protocol");
      }
    } catch {
      return { error: "Webhook URL must be an http(s) address" };
    }
  }

  const current = await getStudioSettings();
  // An empty field means "keep the stored URL" — the form never echoes the
  // secret back, so a blank submit must not wipe it.
  const webhookUrl = submittedUrl || current.rocketChatWebhookUrl;

  if (enabled && !webhookUrl) {
    return { error: "Add the webhook URL before enabling the integration" };
  }

  await prisma.studioSettings.update({
    where: { id: "default" },
    data: {
      rocketChatEnabled: enabled,
      rocketChatWebhookUrl: webhookUrl,
      rocketChatDefaultChannel: channel,
      ...Object.fromEntries(
        EVENT_FLAGS.map((flag) => [flag, formData.get(flag) === "on"]),
      ),
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function sendRocketChatTestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canConfigure(user)) {
    return { error: "You don't have permission to do that" };
  }

  const settings = await getStudioSettings();
  const url =
    String(formData.get("rocketChatWebhookUrl") ?? "").trim() ||
    settings.rocketChatWebhookUrl;

  if (!url) return { error: "Add the webhook URL first" };

  const channel = normaliseChannel(
    String(formData.get("rocketChatDefaultChannel") ?? "") ||
      settings.rocketChatDefaultChannel,
  );

  const result = await postToWebhook(url, {
    channel,
    text: "*Studio Tracker* — test message",
    attachments: [
      {
        title: "The integration is wired up",
        title_link: appUrl("/settings"),
        text: `Sent by ${user.name}. Real notifications will look like this.`,
        color: "#4f46e5",
      },
    ],
  });

  await prisma.studioSettings.update({
    where: { id: "default" },
    data: {
      rocketChatLastSentAt: new Date(),
      rocketChatLastOk: result.ok,
      rocketChatLastError: result.ok ? null : result.error.slice(0, 500),
    },
  });

  revalidatePath("/settings");
  return result.ok
    ? { ok: true }
    : { error: `Delivery failed — ${result.error}` };
}

export async function updateStudioPortalDefaultsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canConfigure(user)) {
    return { error: "You don't have permission to change studio settings" };
  }

  await saveDefaultPortalValues(readPortalValues(formData));

  revalidatePath("/settings");
  revalidatePath("/projects/new");
  return { ok: true };
}

/**
 * Incoming git events.
 *
 * The secret is stored in the clear because we have to recompute the same HMAC
 * the forge computed; there is no hash that would let us do that. It is only
 * ever shown once, right after it is generated, the same way tokens are.
 */
export async function updateGitAction(
  _prev: GitState,
  formData: FormData,
): Promise<GitState> {
  const user = await requireUser();
  if (!canConfigure(user)) {
    return { error: "You don't have permission to change studio settings" };
  }

  const current = await getStudioSettings();
  const enabled = formData.get("gitEnabled") === "on";
  const rotate = formData.get("rotate") === "on";

  const secret =
    rotate || !current.gitSecret
      ? randomBytes(24).toString("base64url")
      : current.gitSecret;

  if (enabled && !secret) {
    return { error: "Generate a secret before enabling git events" };
  }

  await prisma.studioSettings.update({
    where: { id: "default" },
    data: {
      gitEnabled: enabled,
      gitSecret: secret,
      gitStatusOnOpen:
        String(formData.get("gitStatusOnOpen") ?? "").trim() || null,
      gitStatusOnMerge:
        String(formData.get("gitStatusOnMerge") ?? "").trim() || null,
    },
  });

  revalidatePath("/settings");
  // The plaintext goes back to the browser once, so it can be pasted into the
  // forge. It is never rendered again on a later page load.
  return {
    ok: true,
    secret: rotate || !current.gitSecret ? secret : undefined,
  };
}

/**
 * Whether the agent/human split is shown at all inside the studio.
 *
 * The `source` on each work log is written regardless: that is a fact about
 * how the work was done, and hiding it in the interface must never mean losing
 * it in the data.
 */
export async function updateAgentHoursAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canConfigure(user)) {
    return { error: "You don't have permission to change studio settings" };
  }

  await prisma.studioSettings.update({
    where: { id: "default" },
    data: { agentHoursVisible: formData.get("agentHoursVisible") === "on" },
  });

  revalidatePath("/settings");
  revalidatePath("/reports");
  return { ok: true };
}

/**
 * Deadline rules and the daily digest.
 *
 * Every rule is one number, and zero switches it off — see the schema for why
 * there is no separate enabled flag to contradict it.
 */
const RULES = [
  { name: "remindDueWithinDays", max: 30 },
  { name: "remindStalledDays", max: 60 },
  { name: "remindApprovalDays", max: 60 },
  { name: "remindClientReplyHours", max: 336 },
  { name: "remindTimerHours", max: 72 },
] as const;

export async function updateRemindersAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canConfigure(user)) {
    return { error: "You don't have permission to change studio settings" };
  }

  const numbers: Record<string, number> = {};
  for (const rule of RULES) {
    const raw = Number(formData.get(rule.name));
    if (!Number.isFinite(raw) || raw < 0 || raw > rule.max) {
      return { error: `${rule.name} must be between 0 and ${rule.max}` };
    }
    numbers[rule.name] = Math.round(raw);
  }

  const emailDigest = formData.get("digestEmailEnabled") === "on";
  if (emailDigest && !isMailConfigured()) {
    return {
      error:
        "There is no mail server configured, so the email digest cannot be sent",
    };
  }

  await prisma.studioSettings.update({
    where: { id: "default" },
    data: {
      ...numbers,
      remindBudgetPace: formData.get("remindBudgetPace") === "on",
      digestChatEnabled: formData.get("digestChatEnabled") === "on",
      digestEmailEnabled: emailDigest,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Emails the digest to whoever pressed the button, and to nobody else.
 *
 * Deliberately not a "run it now for everyone" button: the point is to see
 * what the letter looks like, and the fastest way to make a studio switch a
 * feature off is to mail all of them twice while someone tries it out.
 */
export async function sendDigestPreviewAction(
  _prev: ActionState,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canConfigure(user)) {
    return { error: "You don't have permission to do that" };
  }

  if (!isMailConfigured()) {
    return { error: "No mail server is configured on this server" };
  }

  const signals = signalsFor(await collectSignals(), user);
  if (!signals.length) {
    return {
      error:
        "Nothing needs your attention right now, so there is no letter to send",
    };
  }

  const letter = renderPersonalDigest({ name: user.name, signals });
  const sent = await sendMail({ to: user.email, ...letter });

  return sent.ok ? { ok: true } : { error: `Couldn't send it — ${sent.error}` };
}

/**
 * Drafting with a model.
 *
 * The switch here only says the studio is willing; each project still decides
 * for itself, and `aiDefaultAllowed` is merely what a newly created project
 * starts with. Turning this off stops every draft at once.
 */
export async function updateAiAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canConfigure(user)) {
    return { error: "You don't have permission to change studio settings" };
  }

  const enabled = formData.get("aiEnabled") === "on";
  const model = String(formData.get("aiModel") ?? "").trim();

  if (enabled && !isAiConfigured()) {
    return {
      error:
        "No OPENROUTER_API_KEY is set on this server, so nothing can be sent",
    };
  }

  if (enabled && !model) {
    return {
      error: "Name the model to use — any slug from openrouter.ai/models",
    };
  }

  await prisma.studioSettings.update({
    where: { id: "default" },
    data: {
      aiEnabled: enabled,
      ...(model ? { aiModel: model } : {}),
      aiDefaultAllowed: formData.get("aiDefaultAllowed") === "on",
      // Only when the switch was actually on the form. It is hidden while
      // outreach is off, and a hidden checkbox posts nothing — without this
      // marker, saving this card would quietly answer a question nobody asked.
      ...(formData.get("outreachAiOffered")
        ? { outreachAiAllowed: formData.get("outreachAiAllowed") === "on" }
        : {}),
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * How long the studio's own history is kept.
 *
 * Zero keeps something forever, the same convention as the reminder rules —
 * and leaving all three at zero is a decision, not an absence of one. The form
 * says so rather than letting the default pass for a policy.
 */
const RETENTION = [
  { name: "retainActivityDays", max: 3650 },
  { name: "retainChatDays", max: 3650 },
  { name: "retainAiUsageDays", max: 3650 },
  { name: "retainMeetingDays", max: 3650 },
] as const;

export async function updateRetentionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    return { error: "Only an administrator can change retention periods" };
  }

  const values: Record<string, number> = {};
  for (const rule of RETENTION) {
    const raw = Number(formData.get(rule.name));
    if (!Number.isFinite(raw) || raw < 0 || raw > rule.max) {
      return { error: `Each period must be between 0 and ${rule.max} days` };
    }
    values[rule.name] = Math.round(raw);
  }

  await prisma.studioSettings.update({
    where: { id: "default" },
    data: values,
  });

  revalidatePath("/settings");
  return { ok: true };
}

/** What the next sweep would remove, so nobody has to find out afterwards. */
export type RetentionPreviewState = {
  error?: string;
  ok?: boolean;
  preview?: string;
} | null;

export async function previewRetentionAction(
  _prev: RetentionPreviewState,
): Promise<RetentionPreviewState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    return { error: "Only an administrator can do that" };
  }

  const counts = await previewRetention();
  return { ok: true, preview: describeRetention(counts) };
}

/**
 * Who answers for the data, as shown to customers in the portal.
 *
 * Everything else in that notice is read from the live configuration; these
 * three are the parts the tracker cannot know, and when they are empty the
 * notice says so rather than inventing a controller.
 */
export async function updatePrivacyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    return { error: "Only an administrator can change this" };
  }

  const email = String(formData.get("privacyContactEmail") ?? "").trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That does not look like an email address" };
  }

  await prisma.studioSettings.update({
    where: { id: "default" },
    data: {
      studioLegalName:
        String(formData.get("studioLegalName") ?? "").trim() || null,
      privacyContactEmail: email || null,
      privacyNoteExtra:
        String(formData.get("privacyNoteExtra") ?? "").trim() || null,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/portal/privacy");
  return { ok: true };
}

/**
 * Outreach: the master switch, and what sending needs to know.
 *
 * The postal address is refused as empty while the switch is on, rather than
 * being allowed and failing later: a commercial email without one is not
 * something this tracker will put on the wire, and finding that out from a
 * cancelled message is worse than finding it out here.
 */
export async function updateOutreachAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canConfigure(user)) {
    return { error: "You don't have permission to change studio settings" };
  }

  const enabled = formData.get("outreachEnabled") === "on";
  const cap = Number(String(formData.get("outreachDailyCap") ?? "60"));
  if (!Number.isInteger(cap) || cap < 1 || cap > 2000) {
    return { error: "The daily ceiling has to be between 1 and 2000" };
  }

  // Generated rather than typed, and long. Postmark signs nothing, so for
  // that provider this secret is the only thing standing between the endpoint
  // and the internet — a memorable phrase would not do.
  const current = await getStudioSettings();
  const rotate = formData.get("rotateInbound") === "on";
  const inboundSecret =
    rotate || !current.outreachInboundSecret
      ? randomBytes(32).toString("base64url")
      : current.outreachInboundSecret;

  const domain = String(formData.get("outreachReplyDomain") ?? "").trim();
  if (domain && !/^[a-z0-9.-]+.[a-z]{2,}$/i.test(domain)) {
    return { error: "The reply domain should look like hi.studio.example" };
  }

  await prisma.studioSettings.update({
    where: { id: "default" },
    data: {
      outreachEnabled: enabled,
      outreachFromName:
        String(formData.get("outreachFromName") ?? "").trim() || null,
      outreachReplyDomain: domain || null,
      outreachPostalAddress:
        String(formData.get("outreachPostalAddress") ?? "").trim() || null,
      outreachSignature:
        String(formData.get("outreachSignature") ?? "").trim() || null,
      outreachDailyCap: cap,
      outreachInboundSecret: inboundSecret,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/outreach");
  return { ok: true };
}

/**
 * Proving the second set of credentials works, through the outreach transport
 * rather than the transactional one — which is the whole question being asked.
 */
export async function sendOutreachTestAction(
  _prev: ActionState,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canConfigure(user)) {
    return { error: "You don't have permission to change studio settings" };
  }

  const verified = await verifyOutreachMail();
  if (!verified.ok) return { error: verified.error };

  const sent = await sendOutreachMail({
    to: user.email,
    subject: "Outreach mail works",
    text: [
      "This went out through the outreach transport, not the one that carries",
      "invites and password resets. If it arrived, the second channel is set",
      "up correctly.",
      "",
      "Nothing was sent to anybody else.",
    ].join("\n"),
  });

  return sent.ok ? { ok: true } : { error: sent.error };
}
