import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

import { prisma } from "./db";
import { issueAuthToken } from "./auth-tokens";
import { uniqueHandle } from "./mentions";

/**
 * The first administrator, on a database that has none.
 *
 * A tracker deployed through a panel has no shell to run SQL in, and telling
 * an operator to open a database console to create their own account is a poor
 * way to meet a piece of software. So: set `BOOTSTRAP_ADMIN_EMAIL`, start the
 * server, and read the one-time link out of the log.
 *
 * Three things make this safe to leave in:
 *
 * - It does nothing unless the `User` table is **completely empty**. Not "no
 *   admins" — no users at all. A tracker in use can never be reopened this way,
 *   whatever the variable says.
 * - It never sets a password. The account starts unusable and the person
 *   chooses their own through the same one-time link every other invite uses,
 *   hashed in the database like all the others.
 * - The link is printed once, to the server log, where only whoever runs the
 *   server can read it. It expires like any invite.
 */
export async function bootstrapAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return;

  let existing: number;
  try {
    existing = await prisma.user.count();
  } catch (e) {
    // A database that is not ready yet is not an error worth crashing on: the
    // next start will try again.
    console.warn("[bootstrap] could not check for existing accounts:", e);
    return;
  }

  if (existing > 0) {
    console.log(
      `[bootstrap] ${existing} account(s) already exist — doing nothing.`,
    );
    return;
  }

  const user = await prisma.user.create({
    data: {
      email,
      handle: await uniqueHandle(email),
      name: process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrator",
      // Deliberately unusable: nobody, including this code, knows a password
      // for this account until its owner picks one.
      passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
      role: "ADMIN",
    },
  });

  const issued = await issueAuthToken({ userId: user.id, kind: "INVITE" });

  console.log(
    [
      "",
      "─".repeat(72),
      "  First administrator created.",
      `  ${email}`,
      "",
      "  Open this once to choose a password:",
      `  ${issued.url}`,
      "",
      `  It expires ${issued.expiresAt.toUTCString()} and works a single time.`,
      "  Remove BOOTSTRAP_ADMIN_EMAIL once you are in.",
      "─".repeat(72),
      "",
    ].join("\n"),
  );
}
