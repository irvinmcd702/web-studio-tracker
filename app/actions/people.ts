"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { issueAuthToken } from "@/lib/auth-tokens";
import { deliverAuthToken } from "@/lib/deliver-token";
import { anonymiseUser } from "@/lib/anonymise";
import { handleShape, uniqueHandle } from "@/lib/mentions";

/** Actions that hand back a one-time link for the operator to pass on. */
export type LinkState = {
  error?: string;
  ok?: boolean;
  /** Only present when the link could not be emailed and has to be passed on. */
  link?: string;
  expiresAt?: string;
  emailed?: boolean;
  note?: string;
} | null;

async function assertConfigurer() {
  const user = await requireUser();
  if (!canConfigure(user))
    throw new Error("You don't have permission to do that");
  return user;
}

/**
 * A password nobody knows. New accounts start here and stay unusable until the
 * person follows their invite link — so an account is never created with a
 * password somebody typed into a form and passed along by hand.
 */
async function unusablePassword() {
  return bcrypt.hash(randomBytes(32).toString("hex"), 10);
}

const PALETTE = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
];

export async function createUserAction(
  _prev: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const actor = await assertConfigurer();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "MEMBER") as
    "ADMIN" | "MANAGER" | "MEMBER";

  if (!z.string().email().safeParse(email).success) {
    return { error: "Enter a valid email address" };
  }
  if (name.length < 2) return { error: "Enter a name" };

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return { error: "A user with this email already exists" };

  const count = await prisma.user.count();

  const user = await prisma.user.create({
    data: {
      email,
      handle: await uniqueHandle(email),
      name,
      passwordHash: await unusablePassword(),
      role,
      position: String(formData.get("position") ?? "").trim() || null,
      gitLogin: String(formData.get("gitLogin") ?? "").trim() || null,
      avatarColor: PALETTE[count % PALETTE.length]!,
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

  revalidatePath("/people");
  return { ok: true, ...delivery };
}

export async function updateUserAction(
  _prev: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const actor = await assertConfigurer();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "MEMBER") as
    "ADMIN" | "MANAGER" | "MEMBER" | "CLIENT";

  if (name.length < 2) return { error: "Enter a name" };

  // A planning figure, so zero is allowed — somebody on leave has no week —
  // but not a negative one and not a fantasy.
  const capacity = Math.round(Number(formData.get("weeklyCapacity") ?? 40));
  if (!Number.isFinite(capacity) || capacity < 0 || capacity > 80) {
    return { error: "Weekly hours must be between 0 and 80" };
  }

  if (id === actor.id && role !== actor.role) {
    return { error: "You can't change your own role" };
  }

  // A mention written last year should still point at the same person, so a
  // handle can be corrected but never quietly collide with somebody else's.
  const handle = handleShape(String(formData.get("handle") ?? ""));
  const handleOwner = await prisma.user.findUnique({ where: { handle } });
  if (handleOwner && handleOwner.id !== id) {
    return { error: `@${handle} is already taken` };
  }

  await prisma.user.update({
    where: { id },
    data: {
      name,
      handle,
      role,
      position: String(formData.get("position") ?? "").trim() || null,
      gitLogin: String(formData.get("gitLogin") ?? "").trim() || null,
      weeklyCapacity: capacity,
    },
  });

  revalidatePath("/people");
  revalidatePath("/workload");
  return { ok: true };
}

/**
 * Issues a reset link instead of setting a password on someone's behalf: the
 * operator never learns the password, and the link expires on its own.
 */
export async function createResetLinkAction(
  _prev: LinkState,
  formData: FormData,
): Promise<LinkState> {
  const actor = await assertConfigurer();
  const id = String(formData.get("id"));

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return { error: "User not found" };
  if (!user.isActive) return { error: "This account is disabled" };

  const kind = user.passwordChangedAt ? "RESET" : "INVITE";
  const issued = await issueAuthToken({
    userId: user.id,
    kind,
    createdById: actor.id,
  });

  const delivery = await deliverAuthToken({
    to: user.email,
    name: user.name,
    kind,
    issued,
  });

  revalidatePath("/people");
  return { ok: true, ...delivery };
}

export async function toggleUserActiveAction(formData: FormData) {
  const actor = await assertConfigurer();
  const id = String(formData.get("id"));

  if (id === actor.id) throw new Error("You can't deactivate yourself");

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return;

  await prisma.user.update({
    where: { id },
    data: {
      isActive: !user.isActive,
      // Disabling an account also drops any live session it had.
      ...(user.isActive ? { passwordChangedAt: new Date() } : {}),
    },
  });

  // Outstanding links for a disabled account are void.
  if (user.isActive) {
    await prisma.authToken.deleteMany({ where: { userId: id, usedAt: null } });
  }

  revalidatePath("/people");
}

/**
 * Erasing a person's data while keeping the work they did.
 *
 * Deliberately not called "delete": the row survives, stripped of everything
 * that names anyone, so the hours on a client's invoice and the comment
 * somebody replied to are still there. See `lib/anonymise.ts` for why a real
 * delete would take the billing history with it.
 *
 * Admins only — a manager can create and deactivate people, but erasing one is
 * irreversible and belongs with whoever answers for the studio's records.
 */
export type AnonymiseState = {
  error?: string;
  ok?: boolean;
  /** What survived, so the operator sees it rather than trusting a promise. */
  summary?: string;
} | null;

export async function anonymiseUserAction(
  _prev: AnonymiseState,
  formData: FormData,
): Promise<AnonymiseState> {
  const actor = await requireUser();
  if (actor.role !== "ADMIN") {
    return { error: "Only an administrator can erase a person's data" };
  }

  const id = String(formData.get("id") ?? "");
  const typed = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();

  const target = await prisma.user.findUnique({
    where: { id },
    select: { email: true },
  });
  if (!target) return { error: "That person no longer exists" };

  // Typed rather than clicked: this cannot be undone, and a misplaced click on
  // the wrong row of a list is exactly how it would go wrong.
  if (typed !== target.email.toLowerCase()) {
    return { error: "Type the person's email address exactly to confirm" };
  }

  const result = await anonymiseUser({ userId: id, actorId: actor.id });
  if (!result.ok) return { error: result.error };

  revalidatePath("/people");

  const kept = Object.entries(result.kept)
    .filter(([, count]) => count > 0)
    .map(
      ([what, count]) =>
        `${count} ${what.replace(/([A-Z])/g, " $1").toLowerCase()}`,
    );

  return {
    ok: true,
    summary: kept.length
      ? `Erased. Kept ${kept.join(", ")} against the anonymous account ${result.handle}.`
      : `Erased. The account ${result.handle} had no work attached to it.`,
  };
}
