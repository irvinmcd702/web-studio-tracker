"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { notifyRequestCreated } from "@/lib/notify";
import { describeStatusChange, recordTimeline } from "@/lib/timeline";
import { clientIpFrom } from "@/lib/client-ip";
import { allowPublic } from "@/lib/public-rate-limit";
import type { ActionState } from "@/components/ui/form";

const requestSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200),
  description: z
    .string()
    .min(10, "Describe the work in a bit more detail (10+ characters)")
    .max(8000),
  contactName: z.string().max(120).optional().nullable(),
  contactEmail: z.string().max(160).optional().nullable(),
  contactPhone: z.string().max(40).optional().nullable(),
  companyName: z.string().max(160).optional().nullable(),
  budgetNote: z.string().max(200).optional().nullable(),
  source: z.string().max(80).optional().nullable(),
});

function readRequest(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    contactName: String(formData.get("contactName") ?? "").trim() || null,
    contactEmail: String(formData.get("contactEmail") ?? "").trim() || null,
    contactPhone: String(formData.get("contactPhone") ?? "").trim() || null,
    companyName: String(formData.get("companyName") ?? "").trim() || null,
    budgetNote: String(formData.get("budgetNote") ?? "").trim() || null,
    source: String(formData.get("source") ?? "").trim() || null,
  };
}

/**
 * Public intake form — no authentication.
 *
 * Counted per address per hour. The allowance is deliberately generous: this
 * is guarding a triage inbox from being flooded, not guarding an account, and
 * a limit that turns away a real enquiry has done more damage than the flood
 * would have.
 */
export async function submitPublicRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const allowed = await allowPublic("intake", clientIpFrom(await headers()));
  if (!allowed.ok) {
    return {
      error:
        "That is a lot of requests from one place. Try again in an hour, or email us directly.",
    };
  }

  const parsed = requestSchema.safeParse(readRequest(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  if (!parsed.data.contactEmail && !parsed.data.contactPhone) {
    return { error: "Leave an email or a phone number so we can reach you" };
  }

  const request = await prisma.clientRequest.create({
    data: { ...parsed.data, source: parsed.data.source ?? "Website form" },
  });

  await notifyRequestCreated(request);

  revalidatePath("/requests");
  return { ok: true };
}

/** Staff logging an inquiry that arrived by phone, email, referral… */
export async function createRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (user.role === "CLIENT")
    throw new Error("You don't have permission to do that");

  const parsed = requestSchema.safeParse(readRequest(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const request = await prisma.clientRequest.create({
    data: {
      ...parsed.data,
      source: parsed.data.source ?? "Added manually",
      clientId: String(formData.get("clientId") ?? "") || null,
      ownerId: user.id,
    },
  });

  await notifyRequestCreated(request);

  revalidatePath("/requests");
  return { ok: true };
}

export async function updateRequestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (user.role === "CLIENT")
    throw new Error("You don't have permission to do that");

  const id = String(formData.get("id"));
  const status = String(formData.get("status") ?? "NEW") as
    | "NEW"
    | "IN_REVIEW"
    | "ACCEPTED"
    | "CONVERTED"
    | "REJECTED";

  const existing = await prisma.clientRequest.findUnique({ where: { id } });
  if (!existing) return { error: "Request not found" };

  if (existing.projectId && status !== "CONVERTED") {
    return {
      error: "This request already became a project — its status is locked",
    };
  }
  if (!existing.projectId && status === "CONVERTED") {
    return {
      error: "To mark a request as converted, create a project from it",
    };
  }

  await prisma.clientRequest.update({
    where: { id },
    data: {
      status,
      ownerId: String(formData.get("ownerId") ?? "") || null,
      clientId: String(formData.get("clientId") ?? "") || null,
    },
  });

  // Only when it actually moved. Saving the triage form without touching the
  // status is not an event, and a diary that records non-events is one people
  // stop reading.
  if (existing.status !== status) {
    await recordTimeline({
      kind: "STATUS",
      summary: describeStatusChange(existing.status, status),
      userId: user.id,
      requestId: id,
    });
  }

  revalidatePath("/requests");
  revalidatePath(`/requests/${id}`);
  return { ok: true };
}

export async function deleteRequestAction(formData: FormData) {
  const user = await requireUser();
  if (!canConfigure(user))
    throw new Error("You don't have permission to do that");

  const id = String(formData.get("id"));
  await prisma.clientRequest.delete({ where: { id } });

  revalidatePath("/requests");
  redirect("/requests");
}

/**
 * Creates the customer company record from the request's contact details and
 * links them, so the follow-up project can be attached to a real client.
 */
export async function promoteRequestClientAction(formData: FormData) {
  const user = await requireUser();
  if (user.role === "CLIENT")
    throw new Error("You don't have permission to do that");

  const id = String(formData.get("id"));
  const request = await prisma.clientRequest.findUnique({ where: { id } });
  if (!request || request.clientId) return;

  const client = await prisma.client.create({
    data: {
      name:
        request.companyName?.trim() ||
        request.contactName?.trim() ||
        request.title,
      contactName: request.contactName,
      email: request.contactEmail,
      phone: request.contactPhone,
      notes: `Created from request: ${request.title}`,
    },
  });

  await prisma.clientRequest.update({
    where: { id },
    data: {
      clientId: client.id,
      status: request.status === "NEW" ? "IN_REVIEW" : request.status,
    },
  });

  // The client record has no history of its own before this moment, so this is
  // its first line: where it came from.
  await recordTimeline({
    kind: "SYSTEM",
    summary: `Created from the request "${request.title}"`,
    userId: user.id,
    clientId: client.id,
  });
  await recordTimeline({
    kind: "SYSTEM",
    summary: `Client record created: ${client.name}`,
    userId: user.id,
    requestId: id,
  });
  if (request.status === "NEW") {
    await recordTimeline({
      kind: "STATUS",
      summary: describeStatusChange("NEW", "IN_REVIEW"),
      userId: user.id,
      requestId: id,
    });
  }

  revalidatePath(`/requests/${id}`);
  revalidatePath("/clients");
}
