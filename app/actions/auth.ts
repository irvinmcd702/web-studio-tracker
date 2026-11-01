"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { createSession, destroySession } from "@/lib/session";
import {
  checkLock,
  clearFailures,
  formatRetryAfter,
  loginKeys,
  recordFailure,
} from "@/lib/rate-limit";
import { lookupAuthToken, TOKEN_ERRORS } from "@/lib/auth-tokens";
import { clientIpFrom } from "@/lib/client-ip";
import type { ActionState } from "@/components/ui/form";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

async function clientIp() {
  return clientIpFrom(await headers());
}

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]!.message };
  }

  const keys = loginKeys(parsed.data.email, await clientIp());

  const lock = await checkLock(keys);
  if (lock.locked) {
    return {
      error: `Too many attempts. Try again in ${formatRetryAfter(lock.retryAfterMs)}.`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });

  const valid =
    user && user.isActive
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;

  if (!valid) {
    const now = await recordFailure(keys);
    // Same message for unknown user and wrong password — don't leak which.
    return {
      error: now.locked
        ? `Too many attempts. Try again in ${formatRetryAfter(now.retryAfterMs)}.`
        : "Incorrect email or password",
    };
  }

  await clearFailures(keys);
  await createSession(user!.id);
  redirect(user!.role === "CLIENT" ? "/portal" : "/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200);

/**
 * Public: completes an invite or a password reset. The link itself is the
 * credential, so nothing here requires an existing session.
 */
export async function setPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  if (password !== confirm) return { error: "The two passwords don't match" };

  const lookup = await lookupAuthToken(token);
  if (!lookup.ok) return { error: TOKEN_ERRORS[lookup.reason] };

  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: lookup.user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        // Signs out anyone else holding a session for this account.
        passwordChangedAt: now,
      },
    }),
    prisma.authToken.update({
      where: { id: lookup.tokenId },
      data: { usedAt: now },
    }),
    // Any other outstanding link for this account is now void.
    prisma.authToken.deleteMany({
      where: { userId: lookup.user.id, usedAt: null },
    }),
  ]);

  await clearFailures(loginKeys(lookup.user.email, null));

  await createSession(lookup.user.id);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: lookup.user.id },
    select: { role: true },
  });
  redirect(user.role === "CLIENT" ? "/portal" : "/dashboard");
}
