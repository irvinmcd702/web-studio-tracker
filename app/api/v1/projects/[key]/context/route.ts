import { withToken, fail } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { projectScope } from "@/lib/permissions";
import { formatDate, formatHours, formatMoney, ticketKey } from "@/lib/utils";

/**
 * The context pack: everything an agent should read before touching a project,
 * as one markdown document.
 *
 * It is deliberately markdown rather than JSON — this text goes straight into
 * a system prompt. Client-facing docs and internal docs are both included
 * because the agent works for the studio; nothing here ever reaches the portal.
 */
export const GET = withToken(async ({ actor, params, request }) => {
  const key = (params.key ?? "").trim();

  const project = await prisma.project.findFirst({
    where: {
      AND: [projectScope(actor), { key: { equals: key, mode: "insensitive" } }],
    },
    include: {
      client: true,
      manager: true,
      workflow: { include: { statuses: { orderBy: { position: "asc" } } } },
      members: { include: { user: true }, orderBy: { addedAt: "asc" } },
      docs: { orderBy: { updatedAt: "desc" } },
    },
  });

  if (!project) {
    return fail(404, "not_found", `No project ${key} that this token can see`);
  }

  const openTickets = await prisma.ticket.findMany({
    where: { projectId: project.id, status: { category: { not: "DONE" } } },
    orderBy: [{ priority: "desc" }, { number: "asc" }],
    take: 30,
    include: { status: true, assignee: true },
  });

  const lines: string[] = [];

  lines.push(`# ${project.name} (${project.key})`, "");
  lines.push(
    [
      project.client ? `Client: ${project.client.name}` : "Internal project",
      project.manager ? `PM: ${project.manager.name}` : null,
      `Status: ${project.status}`,
      project.dueDate ? `Due: ${formatDate(project.dueDate)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    "",
  );

  if (project.description) {
    lines.push("## Brief", "", project.description, "");
  }

  lines.push("## Budget", "");
  lines.push(
    project.budgetType === "HOURLY"
      ? `Hourly. Budget ${formatHours(project.budgetHours)} at ${formatMoney(
          project.hourlyRate,
          project.currency,
        )}/h.`
      : `Fixed price ${formatMoney(project.fixedAmount, project.currency)}.`,
    "",
  );

  lines.push("## Crew", "");
  for (const member of project.members) {
    lines.push(
      `- ${member.user.name}${member.role ? ` — ${member.role}` : ""}`,
    );
  }
  if (project.members.length === 0) lines.push("- nobody assigned yet");
  lines.push("");

  lines.push("## Workflow", "");
  lines.push(
    `Statuses in order: ${project.workflow.statuses
      .map((s) => s.name)
      .join(" → ")}.`,
    "",
    'Move a ticket with POST /api/v1/tickets/<KEY>/transition {"to": "<status>"}.',
    "A move can be refused by the transition's conditions; the reason comes back in the response.",
    "",
  );

  if (project.docs.length) {
    lines.push("## Project documents", "");
    for (const doc of project.docs) {
      lines.push(`### ${doc.title}`, "", doc.body.trim(), "");
    }
  }

  lines.push("## Open tickets", "");
  for (const t of openTickets) {
    lines.push(
      `- ${ticketKey(project.key, t.number)} [${t.status.name}] ${t.title}` +
        (t.assignee ? ` (${t.assignee.name})` : " (unassigned)"),
    );
  }
  if (openTickets.length === 0) lines.push("- none");
  lines.push("");

  const markdown = lines.join("\n");

  // JSON when asked for it, markdown by default: an agent pastes the latter
  // straight into its prompt.
  if (request.nextUrl.searchParams.get("format") === "json") {
    return Response.json(
      { project: project.key, markdown },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
