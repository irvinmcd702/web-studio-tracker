import { withToken, json, fail } from "@/lib/api-response";
import { resolveTicket, ticketLookupError } from "@/lib/api-tickets";
import { ticketDetail } from "@/lib/api-serialise";

/**
 * `GET /api/v1/tickets/ACME-14`
 *
 * The full ticket, including the transitions that are legal from here and what
 * each one requires. An agent that can read the rules doesn't have to guess a
 * move and then fail.
 */
export const GET = withToken(async ({ actor, params }) => {
  const key = params.key ?? "";

  const found = await resolveTicket(actor, key);
  if ("error" in found) return ticketLookupError(key, found.error);

  const detail = await ticketDetail(found.ticket.id);
  if (!detail) return fail(404, "not_found", `No ticket ${key}`);

  return json(detail);
});
