import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role, User } from "@prisma/client";

import { prisma } from "./db";
import { readSession } from "./session";

export type SessionUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "avatarColor" | "position" | "clientId"
>;

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarColor: true,
      position: true,
      clientId: true,
      isActive: true,
      passwordChangedAt: true,
    },
  });

  if (!user || !user.isActive) return null;

  // A password change invalidates every session issued before it, so a reset
  // kicks out whoever else was signed in.
  if (user.passwordChangedAt) {
    const changedAtSeconds = Math.floor(
      user.passwordChangedAt.getTime() / 1000,
    );
    if (session.issuedAt < changedAtSeconds) return null;
  }

  const { isActive: _isActive, passwordChangedAt: _changed, ...rest } = user;
  return rest;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Studio staff — everyone except external client portal users. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "CLIENT") redirect("/portal");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export function isStaff(user: SessionUser) {
  return user.role !== "CLIENT";
}

/** Can configure workflows, teams, users, clients. */
export function canAdminister(user: SessionUser) {
  return user.role === "ADMIN" || user.role === "MANAGER";
}
