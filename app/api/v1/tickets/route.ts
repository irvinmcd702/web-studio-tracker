import { withToken, json, fail } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { projectScope } from "@/lib/permissions";
import { ticketSummary } from "@/lib/api-serialise";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

/**
 * `GET /api/v1/tickets?assignee=me&project=ACME&status=open`
 *
 * Everything runs through the same `projectScope` the pages use, so a token
 * can never list a project its owner can't open.
 */
export const GET = withToken(async ({ actor, request }) => {
  const params = request.nextUrl.searchParams;

  // Clamped rather than trusted: a negative take is backwards pagination in
  // Prisma, which is not what anyone asking for "-5 tickets" meant.
  const requested = Number(params.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const projectKey = params.get("project")?.trim();
  const assignee = params.get("assignee")?.trim();
  const status = params.get("status")?.trim();
  const q = params.get("q")?.trim();

  if (projectKey) {
    const exists = await prisma.project.findFirst({
      where: {
        AND: [
          projectScope(actor),
          { key: { equals: projectKey, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    if (!exists) {
      return fail(
        404,
        "project_not_found",
        `No project ${projectKey} that this token can see`,
      );
    }
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      AND: [
        { project: projectScope(actor) },
        projectKey
          ? { project: { key: { equals: projectKey, mode: "insensitive" } } }
          : {},
        assignee === "me"
          ? { assigneeId: actor.id }
          : assignee === "none"
            ? { assigneeId: null }
            : assignee
              ? {
                  assignee: {
                    email: { equals: assignee, mode: "insensitive" },
                  },
                }
              : {},
        // "open" is the useful default filter: everything not in a Done column.
        status === "open"
          ? { status: { category: { not: "DONE" } } }
          : status === "done"
            ? { status: { category: "DONE" } }
            : status
              ? { status: { name: { equals: status, mode: "insensitive" } } }
              : {},
        q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: limit,
    include: { project: true, status: true, assignee: true },
  });

  return json({
    count: tickets.length,
    tickets: tickets.map(ticketSummary),
  });
});
