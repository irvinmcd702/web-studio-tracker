import { revalidatePath } from "next/cache";

import { withToken, json, fail, readJson } from "@/lib/api-response";
import { TicketOpError, logWork } from "@/lib/ticket-ops";
import { resolveTicket, ticketLookupError } from "@/lib/api-tickets";

/**
 * `POST /api/v1/tickets/ACME-14/worklog` with `{ "hours": 1.5, "note": "…" }`.
 *
 * Time written through an agent token is stored with `source: AGENT`. The
 * studio bills these hours to a client, so the record has to say plainly who
 * did the work; an agent cannot claim to be a person even by accident.
 */
export const POST = withToken(
  async ({ actor, request, params }) => {
    const key = params.key ?? "";

    const found = await resolveTicket(actor, key);
    if ("error" in found) return ticketLookupError(key, found.error);

    const payload = await readJson<{
      hours?: number;
      note?: string;
      spentOn?: string;
    }>(request);

    const hours = Number(payload?.hours);
    if (!Number.isFinite(hours)) {
      return fail(400, "missing_hours", 'Send { "hours": 1.5 }');
    }

    const spentOn = payload?.spentOn ? new Date(payload.spentOn) : null;
    if (spentOn && Number.isNaN(spentOn.getTime())) {
      return fail(400, "bad_date", "spentOn must be a date like 2026-08-04");
    }

    try {
      const { entry } = await logWork({
        ticketId: found.ticket.id,
        hours,
        spentOn,
        description: payload?.note ?? null,
        actor,
        source: actor.token.kind === "AGENT" ? "AGENT" : "HUMAN",
      });

      revalidatePath(`/tickets/${found.ticket.id}`);
      revalidatePath(`/projects/${found.ticket.projectId}`, "layout");

      return json(
        {
          logged: true,
          entry: {
            id: entry.id,
            hours: entry.hours,
            source: entry.source,
            spentOn: entry.spentOn.toISOString().slice(0, 10),
            person: actor.name,
          },
        },
        { status: 201 },
      );
    } catch (e) {
      if (e instanceof TicketOpError) return fail(422, "refused", e.message);
      throw e;
    }
  },
  { write: true },
);
