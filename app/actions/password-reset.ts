"use server";

import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import { issueAuthToken } from "@/lib/auth-tokens";
import { clientIpFrom } from "@/lib/client-ip";
import { deliverAuthToken } from "@/lib/deliver-token";
import { isMailConfigured } from "@/lib/mail";
import {
  checkLock,
  formatRetryAfter,
  recordFailure,
  resetKeys,
} from "@/lib/rate-limit";
import type { ActionState } from "@/components/ui/form";

/**
 * "I forgot my password", without an administrator in the loop.
 *
 * Two rules shape this. The answer never changes — an unknown address, a
 * deactivated account and a real one all get the same sentence, so the form
 * cannot be used to find out who has an account here. And it is rate limited
 * on the same counters as sign-in, so it cannot be used to send somebody a
 * hundred emails either.
 *
 * Without SMTP the whole thing is pointless — the link would have nowhere to
 * go — so the page says so instead of pretending.
 */
export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const sameAnswer = {
    ok: true,
    message:
      "If that address belongs to an account here, a reset link is on its way. Check the spam folder too.",
  } as ActionState & { message?: string };

  if (!email.includes("@")) return { error: "Enter your email address" };

  if (!isMailConfigured()) {
    return {
      error:
        "This tracker has no mail server configured, so it cannot send you a link. Ask an administrator to reset your password.",
    };
  }

  const keys = resetKeys(email, clientIpFrom(await headers()));

  const lock = await checkLock(keys);
  if (lock.locked) {
    return {
      error: `Too many attempts. Try again in ${formatRetryAfter(lock.retryAfterMs)}.`,
    };
  }

  // Counted whether or not the account exists: the limit must not reveal which
  // addresses are real.
  await recordFailure(keys);

  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.isActive) {
    const issued = await issueAuthToken({ userId: user.id, kind: "RESET" });
    await deliverAuthToken({
      to: user.email,
      name: user.name,
      kind: "RESET",
      issued,
    });
  }

  return sameAnswer;
}
