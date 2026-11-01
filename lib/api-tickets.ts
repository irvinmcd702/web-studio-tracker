import { prisma } from "./db";
import type { SessionUser } from "./auth";
import { projectScope } from "./permissions";
import { parseTicketKey } from "./api-serialise";
import { fail } from "./api-response";

/**
 * Finding a ticket by its human key, inside what the caller may see.
 *
 * Lives here rather than next to the route because Next.js allows nothing but
 * handlers to be exported from a `route.ts`, and every `/tickets/[key]/…`
 * endpoint needs the same scope check.
 */
export type TicketLookup =
  | { error: "bad_key" | "not_found" }
  | { ticket: { id: string; projectId: string } };

export async function resolveTicket(
  actor: SessionUser,
  key: string,
): Promise<TicketLookup> {
  const parsed = parseTicketKey(key);
  if (!parsed) return { error: "bad_key" };

  const ticket = await prisma.ticket.findFirst({
    where: {
      AND: [
        { project: projectScope(actor) },
        {
          project: { key: { equals: parsed.projectKey, mode: "insensitive" } },
        },
        { number: parsed.number },
      ],
    },
    select: { id: true, projectId: true },
  });

  if (!ticket) return { error: "not_found" };
  return { ticket };
}

export function ticketLookupError(key: string, error: "bad_key" | "not_found") {
  return error === "bad_key"
    ? fail(400, "bad_key", `Expected a ticket key like ACME-14, got "${key}"`)
    : fail(404, "not_found", `No ticket ${key} that this token can see`);
}
