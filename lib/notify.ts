import { getStudioSettings } from "./settings";
import { appUrl, sendToRocketChat } from "./rocketchat";
import { priorityLabels } from "./labels";
import { formatDate, formatHours, formatMoney, ticketKey } from "./utils";

/**
 * Event-level notification helpers. Each one checks its own studio toggle and
 * swallows every error — a chat outage must never fail the user's action.
 */

type ProjectRef = {
  id: string;
  key: string;
  name: string;
  rocketChatChannel: string | null;
};

async function enabled(
  flag: keyof Awaited<ReturnType<typeof getStudioSettings>>,
) {
  try {
    const settings = await getStudioSettings();
    return settings.rocketChatEnabled && settings[flag] === true;
  } catch {
    return false;
  }
}

async function safeSend(
  channel: string | null,
  text: string,
  attachments?: Parameters<typeof sendToRocketChat>[0]["attachments"],
) {
  try {
    await sendToRocketChat({ channel, text, attachments });
  } catch {
    // Already handled inside sendToRocketChat; this is the last resort.
  }
}

export async function notifyRequestCreated(request: {
  id: string;
  title: string;
  description: string;
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  budgetNote: string | null;
  source: string | null;
}) {
  if (!(await enabled("notifyRequestCreated"))) return;

  await safeSend(null, "*New client request*", [
    {
      title: request.title,
      title_link: appUrl(`/requests/${request.id}`),
      text: request.description.slice(0, 500),
      color: "#e11d48",
      fields: [
        {
          title: "Company",
          value: request.companyName ?? "—",
          short: true,
        },
        {
          title: "Contact",
          value:
            [request.contactName, request.contactEmail]
              .filter(Boolean)
              .join(" · ") || "—",
          short: true,
        },
        { title: "Budget", value: request.budgetNote ?? "—", short: true },
        { title: "Source", value: request.source ?? "—", short: true },
      ],
    },
  ]);
}

export async function notifyClientMessage(input: {
  project: ProjectRef;
  authorName: string;
  body: string;
}) {
  if (!(await enabled("notifyClientMessage"))) return;

  await safeSend(
    input.project.rocketChatChannel,
    `*Client message* in ${input.project.name}`,
    [
      {
        title: input.authorName,
        title_link: appUrl(`/projects/${input.project.id}/chat`),
        text: input.body.slice(0, 800),
        color: "#0891b2",
      },
    ],
  );
}

export async function notifyProjectCreated(input: {
  project: ProjectRef;
  clientName: string | null;
  managerName: string | null;
  actorName: string;
}) {
  if (!(await enabled("notifyProjectCreated"))) return;

  await safeSend(
    input.project.rocketChatChannel,
    `*New project* created by ${input.actorName}`,
    [
      {
        title: `${input.project.key} · ${input.project.name}`,
        title_link: appUrl(`/projects/${input.project.id}`),
        color: "#4f46e5",
        fields: [
          {
            title: "Client",
            value: input.clientName ?? "Internal",
            short: true,
          },
          { title: "PM", value: input.managerName ?? "—", short: true },
        ],
      },
    ],
  );
}

export async function notifyTicketAssigned(input: {
  project: ProjectRef;
  ticketId: string;
  number: number;
  title: string;
  assigneeName: string;
  actorName: string;
  priority: string;
  dueDate: Date | null;
}) {
  if (!(await enabled("notifyTicketAssigned"))) return;

  await safeSend(
    input.project.rocketChatChannel,
    `*Ticket assigned* to ${input.assigneeName} by ${input.actorName}`,
    [
      {
        title: `${ticketKey(input.project.key, input.number)} · ${input.title}`,
        title_link: appUrl(`/tickets/${input.ticketId}`),
        color: "#2563eb",
        fields: [
          {
            title: "Priority",
            value: priorityLabels[input.priority] ?? input.priority,
            short: true,
          },
          {
            title: "Due",
            value: input.dueDate ? formatDate(input.dueDate) : "—",
            short: true,
          },
        ],
      },
    ],
  );
}

export async function notifyTicketStatusChanged(input: {
  project: ProjectRef;
  ticketId: string;
  number: number;
  title: string;
  from: string;
  to: string;
  actorName: string;
}) {
  if (!(await enabled("notifyTicketStatusChanged"))) return;

  await safeSend(
    input.project.rocketChatChannel,
    `*${input.from} → ${input.to}* by ${input.actorName}`,
    [
      {
        title: `${ticketKey(input.project.key, input.number)} · ${input.title}`,
        title_link: appUrl(`/tickets/${input.ticketId}`),
        color: "#7c3aed",
      },
    ],
  );
}

export async function notifyApprovalDecision(input: {
  project: ProjectRef;
  title: string;
  approved: boolean;
  deciderName: string;
  isClient: boolean;
  note: string | null;
}) {
  if (!(await enabled("notifyApprovalDecision"))) return;

  await safeSend(
    input.project.rocketChatChannel,
    input.approved ? "*Stage approved*" : "*Changes requested*",
    [
      {
        title: input.title,
        title_link: appUrl(`/projects/${input.project.id}/approvals`),
        text: input.note ?? undefined,
        color: input.approved ? "#16a34a" : "#d97706",
        fields: [
          {
            title: "Project",
            value: `${input.project.key} · ${input.project.name}`,
            short: true,
          },
          {
            title: "Decided by",
            value: input.isClient
              ? `${input.deciderName} (client)`
              : `${input.deciderName} (recorded by the studio)`,
            short: true,
          },
        ],
      },
    ],
  );
}

export async function notifyBudgetThreshold(input: {
  project: ProjectRef;
  percent: number;
  spentHours: number;
  budgetHours: number;
  spentAmount: number | null;
  currency: string;
}) {
  if (!(await enabled("notifyBudgetThreshold"))) return;

  const over = input.percent >= 100;

  await safeSend(
    input.project.rocketChatChannel,
    over ? "*Budget exhausted*" : "*Budget warning*",
    [
      {
        title: `${input.project.key} · ${input.project.name}`,
        title_link: appUrl(`/projects/${input.project.id}/budget`),
        text: over
          ? "Logged hours have reached the agreed budget."
          : "Logged hours passed 80% of the agreed budget.",
        color: over ? "#dc2626" : "#d97706",
        fields: [
          {
            title: "Logged",
            value: `${formatHours(input.spentHours)} of ${formatHours(input.budgetHours)} (${input.percent}%)`,
            short: true,
          },
          {
            title: "Billed",
            value:
              input.spentAmount != null
                ? formatMoney(input.spentAmount, input.currency)
                : "—",
            short: true,
          },
        ],
      },
    ],
  );
}
