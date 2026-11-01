import { withToken, json } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { projectScope } from "@/lib/permissions";

/**
 * The first call any agent should make: who am I acting as, what am I allowed
 * to do, and which projects can I see at all.
 */
export const GET = withToken(async ({ actor }) => {
  const projects = await prisma.project.findMany({
    where: { AND: [projectScope(actor), { status: { not: "ARCHIVED" } }] },
    orderBy: { key: "asc" },
    select: { key: true, name: true, status: true },
  });

  return json({
    actingAs: {
      name: actor.name,
      email: actor.email,
      role: actor.role,
    },
    token: {
      name: actor.token.name,
      kind: actor.token.kind,
      scopes: actor.scopes,
    },
    projects,
  });
});
