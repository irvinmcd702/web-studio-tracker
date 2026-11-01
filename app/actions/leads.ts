"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { getStudioSettings } from "@/lib/settings";
import { emailKey, looksLikeEmail, suppress } from "@/lib/leads";
import {
  importLeads,
  parseLeadCsv,
  previewLeadImport,
  type ImportOutcome,
  type ParsedLeads,
} from "@/lib/lead-import";
import { recordTimeline } from "@/lib/timeline";
import { notifyRequestCreated } from "@/lib/notify";
import type { ActionState } from "@/components/ui/form";

/**
 * Everything the studio does to its lead base by hand.
 *
 * Nothing in this file sends an email. The campaign machinery is a later
 * phase; what is here is the base itself, the suppression list, and the two
 * one-way doors — turning a lead into a request, and taking an address off
 * limits.
 */

/**
 * Outreach holds people who never asked to be in this database, so it is
 * gated twice: the studio has to have switched it on, and the person has to be
 * an administrator or a manager. Members do not see it at all.
 */
async function assertOutreach() {
  const user = await requireUser();
  if (!canConfigure(user))
    throw new Error("You don't have permission to do that");

  const settings = await getStudioSettings();
  if (!settings.outreachEnabled) throw new Error("Outreach is switched off");

  return user;
}

const leadSchema = z.object({
  email: z.string().max(160).refine(looksLikeEmail, "Enter a valid email address"),
  name: z.string().max(120).optional().nullable(),
  companyName: z.string().max(160).optional().nullable(),
  title: z.string().max(120).optional().nullable(),
  website: z.string().max(200).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  country: z.string().max(80).optional().nullable(),
  /// Required, and the form says why. See the note on the `Lead` model.
  sourceDetail: z
    .string()
    .min(3, "Say where this address came from")
    .max(300),
  consentNote: z.string().max(300).optional().nullable(),
});

function readLead(formData: FormData) {
  const get = (name: string) => String(formData.get(name) ?? "").trim() || null;
  return {
    email: String(formData.get("email") ?? "").trim(),
    name: get("name"),
    companyName: get("companyName"),
    title: get("title"),
    website: get("website"),
    phone: get("phone"),
    country: get("country"),
    sourceDetail: String(formData.get("sourceDetail") ?? "").trim(),
    consentNote: get("consentNote"),
  };
}

export async function createLeadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertOutreach();

  const parsed = leadSchema.safeParse(readLead(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const key = emailKey(parsed.data.email);

  // Both refusals name the reason. "Could not add" would leave somebody
  // retyping an address that was never going to be accepted.
  const blocked = await prisma.suppression.findUnique({
    where: { emailKey: key },
  });
  if (blocked) {
    return {
      error: "That address is on the suppression list — it asked not to be written to",
    };
  }

  const existing = await prisma.lead.findUnique({ where: { emailKey: key } });
  if (existing) return { error: "That address is already in the lead base" };

  const lead = await prisma.lead.create({
    data: {
      ...parsed.data,
      emailKey: key,
      sourceKind: "MANUAL",
      ownerId: user.id,
    },
  });

  await recordTimeline({
    kind: "IMPORT",
    summary: "Added by hand",
    body: parsed.data.sourceDetail,
    userId: user.id,
    leadId: lead.id,
  });

  revalidatePath("/outreach/leads");
  return { ok: true };
}

export async function updateLeadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertOutreach();

  const id = String(formData.get("id"));
  const parsed = leadSchema.safeParse(readLead(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) return { error: "Lead not found" };

  const key = emailKey(parsed.data.email);
  if (key !== existing.emailKey) {
    const clash = await prisma.lead.findUnique({ where: { emailKey: key } });
    if (clash) return { error: "Another lead already has that address" };
  }

  await prisma.lead.update({
    where: { id },
    data: { ...parsed.data, emailKey: key },
  });

  revalidatePath("/outreach/leads");
  revalidatePath(`/outreach/leads/${id}`);
  return { ok: true };
}

/**
 * A real delete. The lead's diary goes with it, and the suppression row — if
 * there is one — stays exactly where it is.
 */
export async function deleteLeadAction(formData: FormData) {
  await assertOutreach();

  const id = String(formData.get("id"));
  await prisma.lead.delete({ where: { id } });

  revalidatePath("/outreach/leads");
  redirect("/outreach/leads");
}

/**
 * Flat rather than a discriminated union: the form reads `error` and
 * `preview` on the same object, and a union would make every read a narrowing
 * exercise for no benefit. `preview` present means the parse succeeded.
 */
export type ImportPreviewState = {
  ok?: boolean;
  error?: string;
  preview?: ImportOutcome;
  problems?: ParsedLeads["problems"];
  headers?: string[];
  /** Echoed back so the confirm step commits the file that was previewed. */
  text?: string;
  fileName?: string;
  sourceDetail?: string;
  consentNote?: string | null;
} | null;

function readImport(formData: FormData) {
  return {
    text: String(formData.get("text") ?? ""),
    fileName: String(formData.get("fileName") ?? "").trim() || "pasted list",
    sourceDetail: String(formData.get("sourceDetail") ?? "").trim(),
    consentNote: String(formData.get("consentNote") ?? "").trim() || null,
  };
}

/** Parses and counts. Writes nothing — the `previewRetentionAction` pattern. */
export async function previewLeadImportAction(
  _prev: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  await assertOutreach();

  const input = readImport(formData);
  if (input.sourceDetail.length < 3) {
    return { error: "Say where this list came from before importing it" };
  }
  if (input.text.trim() === "") return { error: "There is nothing to import" };

  const parsed = parseLeadCsv(input.text);
  const preview = await previewLeadImport(parsed);

  return {
    ok: true,
    preview,
    problems: parsed.problems,
    headers: parsed.headers,
    ...input,
  };
}

export async function importLeadsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertOutreach();

  const input = readImport(formData);
  if (input.sourceDetail.length < 3) {
    return { error: "Say where this list came from before importing it" };
  }

  const parsed = parseLeadCsv(input.text);
  if (parsed.rows.length === 0) {
    return { error: "Nothing in that file could be read as an address" };
  }

  await importLeads(parsed, {
    fileName: input.fileName,
    sourceDetail: input.sourceDetail,
    consentNote: input.consentNote,
    createdById: user.id,
  });

  revalidatePath("/outreach/leads");
  revalidatePath("/outreach");
  return { ok: true };
}

const addressSchema = z.string().refine(looksLikeEmail, "Enter a valid email address");

export async function suppressAddressAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertOutreach();

  const parsed = addressSchema.safeParse(
    String(formData.get("email") ?? "").trim(),
  );
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const { lead } = await suppress({
    email: parsed.data,
    reason: "MANUAL",
    source: "added by hand",
    note: String(formData.get("note") ?? "").trim() || null,
  });

  if (lead) {
    await recordTimeline({
      kind: "UNSUBSCRIBE",
      summary: "Added to the suppression list by hand",
      userId: user.id,
      leadId: lead.id,
    });
  }

  revalidatePath("/outreach/suppression");
  revalidatePath("/outreach/leads");
  return { ok: true };
}

/**
 * Taking an address back off the list.
 *
 * Offered because a mistyped entry would otherwise be permanent, and hidden
 * behind a confirmation because the ordinary reason a row is here is that
 * somebody asked not to be written to.
 */
export async function unsuppressAddressAction(formData: FormData) {
  const user = await assertOutreach();

  const id = String(formData.get("id"));
  const row = await prisma.suppression.findUnique({ where: { id } });
  if (!row) return;

  await prisma.suppression.delete({ where: { id } });

  const lead = await prisma.lead.findUnique({
    where: { emailKey: row.emailKey },
  });
  if (lead) {
    await recordTimeline({
      kind: "SYSTEM",
      summary: "Taken off the suppression list",
      body: `It had been there since ${row.createdAt.toISOString().slice(0, 10)}, recorded as ${row.reason}.`,
      userId: user.id,
      leadId: lead.id,
    });
  }

  revalidatePath("/outreach/suppression");
}

/**
 * The manual half of what phase five will do from a reply: a lead who turns
 * out to be interested becomes a request, in the same triage inbox the public
 * form feeds.
 */
export async function promoteLeadToRequestAction(formData: FormData) {
  const user = await assertOutreach();

  const id = String(formData.get("id"));
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return;

  const request = await prisma.clientRequest.create({
    data: {
      title: lead.companyName
        ? `Enquiry from ${lead.companyName}`
        : `Enquiry from ${lead.email}`,
      description:
        lead.sourceDetail ??
        "Created from an outreach lead. No description was recorded.",
      source: "Outreach",
      contactName: lead.name,
      contactEmail: lead.email,
      contactPhone: lead.phone,
      companyName: lead.companyName,
      ownerId: user.id,
    },
  });

  await prisma.lead.update({
    where: { id },
    data: { status: "CONVERTED" },
  });

  await recordTimeline({
    kind: "SYSTEM",
    summary: `Became the request "${request.title}"`,
    userId: user.id,
    leadId: id,
  });
  await recordTimeline({
    kind: "SYSTEM",
    summary: "Created from an outreach lead",
    body: lead.sourceDetail,
    userId: user.id,
    requestId: request.id,
  });

  await notifyRequestCreated(request);

  revalidatePath(`/outreach/leads/${id}`);
  revalidatePath("/requests");
  redirect(`/requests/${request.id}`);
}
