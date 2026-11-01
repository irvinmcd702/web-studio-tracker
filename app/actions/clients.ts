"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { uniqueHandle } from "@/lib/mentions";
import { requireUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { issueAuthToken } from "@/lib/auth-tokens";
import { deliverAuthToken } from "@/lib/deliver-token";
import type { LinkState } from "@/app/actions/people";
import type { ActionState } from "@/components/ui/form";

async function assertConfigurer() {
  const user = await requireUser();
  if (!canConfigure(user))
    throw new Error("You don't have permission to do that");
  return user;
}

const clientSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  contactName: z.string().max(120).optional().nullable(),
  email: z
    .string()
    .email("Enter a valid email address")
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null)),
  phone: z.string().max(40).optional().nullable(),
  website: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

function readClient(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    contactName: String(formData.get("contactName") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    website: String(formData.get("website") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertConfigurer();

  const parsed = clientSchema.safeParse(readClient(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  await prisma.client.create({ data: parsed.data });
  revalidatePath("/clients");
  return { ok: true };
}

export async function updateClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertConfigurer();
  const id = String(formData.get("id"));

  const parsed = clientSchema.safeParse(readClient(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  await prisma.client.update({ where: { id }, data: parsed.data });
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true };
}

export async function deleteClientAction(formData: FormData) {
  await assertConfigurer();
  const id = String(formData.get("id"));

  const projects = await prisma.project.count({ where: { clientId: id } });
  if (projects > 0) {
    throw new Error(
      `This client has ${projects} project(s) — unlink them before deleting.`,
    );
  }

  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
}

/**
 * Invites a client into the portal. No password is chosen here — the customer
 * sets their own through a one-time link, so nobody has to send a password
 * over chat.
 */
export async function inviteClientUserAction(
  _prev: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const actor = await assertConfigurer();

  const clientId = String(formData.get("clientId"));
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();

  if (!z.string().email().safeParse(email).success) {
    return { error: "Enter a valid email address" };
  }
  if (name.length < 2) return { error: "Enter the contact name" };

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "A user with this email already exists" };

  const user = await prisma.user.create({
    data: {
      email,
      handle: await uniqueHandle(email),
      name,
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
      role: "CLIENT",
      clientId,
      avatarColor: "#0891b2",
    },
  });

  const invite = await issueAuthToken({
    userId: user.id,
    kind: "INVITE",
    createdById: actor.id,
  });

  const delivery = await deliverAuthToken({
    to: user.email,
    name: user.name,
    kind: "INVITE",
    issued: invite,
  });

  revalidatePath(`/clients/${clientId}`);
  return { ok: true, ...delivery };
}

/** Re-issues the link when the first one expired or went astray. */
export async function reinviteClientUserAction(
  _prev: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const actor = await assertConfigurer();
  const userId = String(formData.get("userId"));

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "CLIENT")
    return { error: "Client user not found" };
  if (!user.isActive) return { error: "This account is disabled" };

  const issued = await issueAuthToken({
    userId,
    kind: user.passwordChangedAt ? "RESET" : "INVITE",
    createdById: actor.id,
  });

  const delivery = await deliverAuthToken({
    to: user.email,
    name: user.name,
    kind: user.passwordChangedAt ? "RESET" : "INVITE",
    issued,
  });

  if (user.clientId) revalidatePath(`/clients/${user.clientId}`);
  return { ok: true, ...delivery };
}
