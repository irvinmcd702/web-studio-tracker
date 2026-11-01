import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "./db";
import { logActivity } from "./activity";

/**
 * Erasing a person without erasing the work.
 *
 * A tracker cannot simply delete a user row: hours logged against a client's
 * budget, comments other people replied to and files a project still needs are
 * business records with their own reason to exist, and half of them are wired
 * with `onDelete: Cascade` — a delete would take the invoice history with it.
 *
 * So the personal data goes and the rows stay. Afterwards the account carries
 * no name, no address, no login and no way back in; the twelve hours it logged
 * last March are still twelve hours.
 *
 * **What this does not reach:** free text other people wrote. If a colleague
 * typed the person's name into a comment, that name is in the comment, and no
 * amount of column-scrubbing finds it. The caller is told so plainly rather
 * than sold a guarantee this cannot keep.
 */

export type AnonymiseResult =
  | { ok: true; handle: string; kept: Record<string, number> }
  | { ok: false; error: string };

/** What replaces the name, depending on which side of the studio they were. */
function placeholder(role: string) {
  return role === "CLIENT" ? "Former contact" : "Former colleague";
}

/**
 * A short stable label for the audit trail. It identifies the account without
 * reintroducing anything that was just erased.
 */
function handleFor(userId: string) {
  return `anon-${userId.slice(-6)}`;
}

export async function anonymiseUser({
  userId,
  actorId,
}: {
  userId: string;
  actorId: string;
}): Promise<AnonymiseResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true, email: true },
  });
  if (!user) return { ok: false, error: "That person no longer exists" };

  if (user.email.endsWith("@anonymised.invalid")) {
    return { ok: false, error: "This account has already been erased" };
  }

  // Doing it to yourself signs you out halfway through, and leaves the record
  // of the erasure attributed to an account that no longer names anyone.
  if (userId === actorId) {
    return {
      ok: false,
      error:
        "Ask another administrator to do this — erasing your own account would sign you out mid-way",
    };
  }

  if (user.role === "ADMIN") {
    const admins = await prisma.user.count({
      where: { role: "ADMIN", isActive: true, id: { not: userId } },
    });
    if (admins === 0) {
      return {
        ok: false,
        error: "This is the last active administrator — promote someone first",
      };
    }
  }

  // Counted before the change, to report what survived rather than claim it.
  const [workLogs, comments, chatMessages, uploads] = await Promise.all([
    prisma.workLog.count({ where: { userId } }),
    prisma.ticketComment.count({ where: { authorId: userId } }),
    prisma.chatMessage.count({ where: { authorId: userId } }),
    prisma.attachment.count({ where: { uploadedById: userId } }),
  ]);

  const handle = handleFor(userId);

  await prisma.$transaction([
    // Anything that could still be used to sign in or act as them.
    prisma.authToken.deleteMany({ where: { userId } }),
    prisma.apiToken.deleteMany({ where: { userId } }),
    prisma.runningTimer.deleteMany({ where: { userId } }),

    prisma.user.update({
      where: { id: userId },
      data: {
        // A reserved TLD: this address can never be routed anywhere.
        email: `${handle}-${randomUUID().slice(0, 8)}@anonymised.invalid`,
        name: placeholder(user.role),
        // A handle names somebody just as plainly as their name does, and
        // `@dana` in an old comment must stop pointing at Dana.
        handle,
        position: null,
        gitLogin: null,
        avatarColor: "#64748b",
        passwordHash: bcrypt.hashSync(randomBytes(32).toString("hex"), 10),
        // Every session issued before now is rejected on its next request.
        passwordChangedAt: new Date(),
        isActive: false,
        // Portal access is severed with the link to the customer.
        clientId: null,
      },
    }),
  ]);

  // The record has to prove this happened without putting back what it erased,
  // so it names the actor and a pseudonym, never the person.
  await logActivity({
    type: "user.anonymised",
    message: `erased the personal data of account ${handle}`,
    userId: actorId,
  });

  return {
    ok: true,
    handle,
    kept: { workLogs, comments, chatMessages, uploads },
  };
}

/** Whether a row has already been through the above. */
export function isAnonymised(user: { email: string }) {
  return user.email.endsWith("@anonymised.invalid");
}
