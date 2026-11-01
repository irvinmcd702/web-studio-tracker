import { revalidatePath } from "next/cache";

import { withToken, json, fail, readJson } from "@/lib/api-response";
import { TicketOpError, commentOnTicket } from "@/lib/ticket-ops";
import { resolveTicket, ticketLookupError } from "@/lib/api-tickets";

/**
 * `POST /api/v1/tickets/ACME-14/comments` with `{ "body": "…" }`.
 *
 * An agent that opens a PR or gets stuck should say so on the ticket rather
 * than in a log file nobody reads. The comment is attributed to the person the
 * token acts as, and the token's name is appended so the thread is honest
 * about what wrote it.
 */
export const POST = withToken(
  async ({ actor, request, params }) => {
    const key = params.key ?? "";

    const found = await resolveTicket(actor, key);
    if ("error" in found) return ticketLookupError(key, found.error);

    const payload = await readJson<{ body?: string }>(request);
    const text = payload?.body?.trim();
    if (!text) return fail(400, "missing_body", 'Send { "body": "…" }');

    const signed =
      actor.token.kind === "AGENT"
        ? `${text}\n\n— via ${actor.token.name}`
        : text;

    try {
      const { comment } = await commentOnTicket({
        ticketId: found.ticket.id,
        body: signed,
        actor,
      });

      revalidatePath(`/tickets/${found.ticket.id}`);

      return json(
        {
          posted: true,
          comment: {
            id: comment.id,
            author: actor.name,
            body: comment.body,
            createdAt: comment.createdAt.toISOString(),
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
