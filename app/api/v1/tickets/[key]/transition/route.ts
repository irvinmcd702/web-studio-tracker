import { revalidatePath } from "next/cache";

import { withToken, json, fail, readJson } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { TicketOpError, moveTicket } from "@/lib/ticket-ops";
import { ticketDetail } from "@/lib/api-serialise";
import { resolveTicket, ticketLookupError } from "@/lib/api-tickets";

/**
 * `POST /api/v1/tickets/ACME-14/transition` with `{ "to": "In review" }`.
 *
 * The status is named, not identified: an agent should say where the work is,
 * not look up a cuid. Refusals come back as 422 with the reason the workflow
 * gave, which is the same sentence a person sees in the UI.
 */
export const POST = withToken(
  async ({ actor, request, params }) => {
    const key = params.key ?? "";

    const found = await resolveTicket(actor, key);
    if ("error" in found) return ticketLookupError(key, found.error);

    const body = await readJson<{ to?: string; statusId?: string }>(request);
    const wanted = body?.to?.trim();

    if (!wanted && !body?.statusId) {
      return fail(400, "missing_to", 'Send { "to": "<status name>" }');
    }

    const project = await prisma.project.findUnique({
      where: { id: found.ticket.projectId },
      include: {
        workflow: { include: { statuses: { orderBy: { position: "asc" } } } },
      },
    });
    if (!project) return fail(404, "not_found", "Project not found");

    const target = body?.statusId
      ? project.workflow.statuses.find((s) => s.id === body.statusId)
      : project.workflow.statuses.find(
          (s) => s.name.toLowerCase() === wanted!.toLowerCase(),
        );

    if (!target) {
      return fail(
        422,
        "unknown_status",
        `"${wanted ?? body?.statusId}" is not a status in this project's workflow`,
        { availableStatuses: project.workflow.statuses.map((s) => s.name) },
      );
    }

    try {
      const result = await moveTicket({
        ticketId: found.ticket.id,
        toStatusId: target.id,
        actor,
      });

      revalidatePath(`/tickets/${found.ticket.id}`);
      revalidatePath(`/projects/${found.ticket.projectId}`, "layout");

      return json({
        moved: true,
        from: result.from,
        to: result.to,
        ticket: await ticketDetail(found.ticket.id),
      });
    } catch (e) {
      if (e instanceof TicketOpError) {
        // The workflow refused: that is a normal outcome, not a server fault.
        return fail(422, "transition_refused", e.message);
      }
      throw e;
    }
  },
  { write: true },
);
