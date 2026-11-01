import { formatDate, formatHours, ticketKey } from "./utils";
import { priorityLabels, ticketTypeLabels } from "./labels";

/**
 * A ticket rendered as a brief an agent can act on.
 *
 * Nothing here calls a model. It hands over what the tracker knows — what the
 * work is, what "done" means, which moves are legal and how to report back —
 * and lets whoever runs the agent paste that wherever they work. No prompt is
 * stored and nothing is sent anywhere, so this works on every project whether
 * or not it allows drafting (`lib/ai.ts`, which is the part that does send).
 */

export type PromptTicket = {
  number: number;
  title: string;
  description?: string | null;
  acceptance?: string | null;
  type: string;
  priority: string;
  estimate: number | null;
  dueDate: Date | null;
  status: { name: string };
  assignee: { name: string } | null;
  project: {
    key: string;
    name: string;
    description: string | null;
    client: { name: string } | null;
  };
};

export type PromptTransition = {
  to: string;
  requires: string[];
};

export function buildTicketPrompt({
  ticket,
  transitions,
  appUrl,
}: {
  ticket: PromptTicket;
  transitions: PromptTransition[];
  appUrl: string;
}) {
  const key = ticketKey(ticket.project.key, ticket.number);
  const lines: string[] = [];

  lines.push(`# ${key} · ${ticket.title}`, "");

  lines.push(
    [
      ticketTypeLabels[ticket.type as keyof typeof ticketTypeLabels] ??
        ticket.type,
      priorityLabels[ticket.priority as keyof typeof priorityLabels] ??
        ticket.priority,
      `status: ${ticket.status.name}`,
      ticket.estimate ? `estimate: ${formatHours(ticket.estimate)}` : null,
      ticket.dueDate ? `due: ${formatDate(ticket.dueDate)}` : null,
      ticket.assignee ? `assigned to: ${ticket.assignee.name}` : "unassigned",
    ]
      .filter(Boolean)
      .join(" · "),
    "",
  );

  lines.push("## What we know", "");
  lines.push(
    ticket.description?.trim() || "_The ticket has no description._",
    "",
  );

  lines.push("## Done means", "");
  lines.push(
    ticket.acceptance?.trim() ||
      "_No acceptance criteria written yet. Ask the project manager before you start; do not invent them._",
    "",
  );

  lines.push("## The project", "");
  lines.push(
    `${ticket.project.name} (${ticket.project.key})` +
      (ticket.project.client ? ` for ${ticket.project.client.name}` : ""),
  );
  if (ticket.project.description?.trim()) {
    lines.push("", ticket.project.description.trim());
  }
  lines.push(
    "",
    "The brief, the conventions, the environments and every project document:",
    "",
    `    GET ${appUrl}/api/v1/projects/${ticket.project.key}/context`,
    "",
    "With the studio-tracker MCP server configured, that is the `project_context` tool.",
    "Read it before writing code.",
    "",
  );

  lines.push("## When you have something", "");
  lines.push(
    "Report on the ticket rather than only in the chat you were started from:",
    "",
    `    POST ${appUrl}/api/v1/tickets/${key}/comments   {"body": "what you did, links, what is left"}`,
    `    POST ${appUrl}/api/v1/tickets/${key}/worklog    {"hours": 1.5, "note": "…"}`,
    "",
    "Hours booked with an agent token are recorded as agent work; that is intended, do not work around it.",
    "",
  );

  if (transitions.length) {
    lines.push("Moves that are legal from here:", "");
    for (const transition of transitions) {
      lines.push(
        `    POST ${appUrl}/api/v1/tickets/${key}/transition  {"to": "${transition.to}"}` +
          (transition.requires.length
            ? `   — requires ${transition.requires.join(", ")}`
            : ""),
      );
    }
    lines.push(
      "",
      "A move can still be refused; the response says why. Report the reason, don't retry blindly.",
      "",
    );
  }

  lines.push(
    "Ask before widening the scope: this ticket is what was agreed with the client.",
  );

  return lines.join("\n");
}
