import type { Prisma } from "@prisma/client";

import { prisma } from "./db";
import type { SessionUser } from "./auth";

/** Attached to a project, by any of the ways there are of being attached. */
function connectedTo(userId: string): Prisma.ProjectWhereInput[] {
  return [
    { managerId: userId },
    { members: { some: { userId } } },
    { tickets: { some: { assigneeId: userId } } },
    { allowed: { some: { userId } } },
  ];
}

/**
 * Prisma filter narrowing projects to the ones this user is allowed to see.
 *
 * - ADMIN sees everything, closed projects included. See below.
 * - MANAGER sees every open project, and a closed one only when connected to it.
 * - MEMBER sees projects they manage, are on the crew of, hold a ticket on, or
 *   have been let into by name.
 * - CLIENT sees only projects belonging to their company.
 *
 * **Why closing a project does not close it to administrators.** They hold the
 * database, the backups and everybody's password reset. A switch that claimed
 * to hide a project from them would be describing a wall that is not there,
 * and false comfort about who can read something is worse than none: people
 * write things down differently when they believe nobody is looking. So the
 * interface says plainly who can still see it, and this stays honest.
 *
 * The other reason is duller and just as real: somebody has to be able to
 * unlock it. A flag that could shut out every last person with the right to
 * change it would eventually strand a project nobody could reopen.
 */
export function projectScope(user: SessionUser): Prisma.ProjectWhereInput {
  if (user.role === "ADMIN") return {};

  if (user.role === "CLIENT") {
    // A client without a company must not see anything. Closing a project has
    // no bearing here: it closes the studio's own doors, not the customer's —
    // it is their project, and their portal shows what its own switches allow.
    return { clientId: user.clientId ?? "__none__" };
  }

  if (user.role === "MANAGER") {
    return {
      OR: [{ isConfidential: false }, { OR: connectedTo(user.id) }],
    };
  }

  return { OR: connectedTo(user.id) };
}

export async function canAccessProject(user: SessionUser, projectId: string) {
  const found = await prisma.project.findFirst({
    where: { AND: [{ id: projectId }, projectScope(user)] },
    select: { id: true },
  });
  return Boolean(found);
}

/** Only staff can change project data; clients are read-only + chat. */
export function canEditProject(user: SessionUser) {
  return user.role !== "CLIENT";
}

/** Workflows, teams, clients and users are configured by admins/managers. */
export function canConfigure(user: SessionUser) {
  return user.role === "ADMIN" || user.role === "MANAGER";
}
