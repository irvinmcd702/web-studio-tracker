import type { Prisma } from "@prisma/client";

import { prisma } from "./db";
import { dayKey, dayKeyToDate } from "./time";

/**
 * Period reports over logged time: what was worked on between two dates and
 * what it is worth. Hourly projects bill hours × rate; fixed-price projects
 * have no per-period amount, so money is reported as null rather than guessed.
 */

export type PeriodPreset =
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "this-year"
  | "custom";

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-quarter", label: "This quarter" },
  { value: "last-quarter", label: "Last quarter" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function resolvePeriod(params: {
  preset?: string;
  from?: string;
  to?: string;
}): { preset: PeriodPreset; from: Date; to: Date } {
  const now = new Date();
  const preset = (params.preset ?? "this-month") as PeriodPreset;

  const isDay = (v: string | undefined): v is string =>
    Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

  if (preset === "custom" && isDay(params.from) && isDay(params.to)) {
    return {
      preset,
      from: startOfDay(dayKeyToDate(params.from)),
      to: endOfDay(dayKeyToDate(params.to)),
    };
  }

  const year = now.getFullYear();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3);

  switch (preset) {
    case "last-month":
      return {
        preset,
        from: startOfDay(new Date(year, month - 1, 1)),
        to: endOfDay(new Date(year, month, 0)),
      };
    case "this-quarter":
      return {
        preset,
        from: startOfDay(new Date(year, quarter * 3, 1)),
        to: endOfDay(new Date(year, quarter * 3 + 3, 0)),
      };
    case "last-quarter":
      return {
        preset,
        from: startOfDay(new Date(year, quarter * 3 - 3, 1)),
        to: endOfDay(new Date(year, quarter * 3, 0)),
      };
    case "this-year":
      return {
        preset,
        from: startOfDay(new Date(year, 0, 1)),
        to: endOfDay(new Date(year, 11, 31)),
      };
    default:
      return {
        preset: "this-month",
        from: startOfDay(new Date(year, month, 1)),
        to: endOfDay(new Date(year, month + 1, 0)),
      };
  }
}

export type ReportEntry = {
  id: string;
  date: string;
  projectKey: string;
  projectName: string;
  ticketKey: string;
  ticketTitle: string;
  personName: string;
  /** HUMAN or AGENT, straight off the work log. */
  source: string;
  hours: number;
  amount: number | null;
  currency: string;
  description: string | null;
};

export type ReportProjectRow = {
  projectId: string;
  key: string;
  name: string;
  clientName: string | null;
  budgetType: string;
  currency: string;
  hourlyRate: number | null;
  contractAmount: number | null;
  hours: number;
  /** Of those hours, how many an agent logged. */
  agentHours: number;
  amount: number | null;
  entries: number;
};

export type ReportBreakdownRow = {
  id: string;
  label: string;
  sublabel?: string;
  color?: string;
  hours: number;
  amount: number | null;
  currency: string;
};

export type Report = {
  from: Date;
  to: Date;
  projects: ReportProjectRow[];
  byPerson: ReportBreakdownRow[];
  byTicket: ReportBreakdownRow[];
  entries: ReportEntry[];
  /** Money can't be summed across currencies, so totals are grouped by one. */
  totalsByCurrency: { currency: string; hours: number; amount: number }[];
  totalHours: number;
  /** Across every project in the period. */
  totalAgentHours: number;
};

export async function buildReport(options: {
  from: Date;
  to: Date;
  scope: Prisma.ProjectWhereInput;
  projectId?: string;
  clientId?: string;
}): Promise<Report> {
  const projectWhere: Prisma.ProjectWhereInput = {
    AND: [
      options.scope,
      options.projectId ? { id: options.projectId } : {},
      options.clientId ? { clientId: options.clientId } : {},
    ],
  };

  const logs = await prisma.workLog.findMany({
    where: {
      spentOn: { gte: options.from, lte: options.to },
      ticket: { project: projectWhere },
    },
    orderBy: [{ spentOn: "asc" }, { createdAt: "asc" }],
    include: {
      user: true,
      ticket: { include: { project: { include: { client: true } } } },
    },
  });

  const rate = (project: { budgetType: string; hourlyRate: number | null }) =>
    project.budgetType === "HOURLY" ? project.hourlyRate : null;

  const projects = new Map<string, ReportProjectRow>();
  const people = new Map<string, ReportBreakdownRow>();
  const tickets = new Map<string, ReportBreakdownRow>();
  const entries: ReportEntry[] = [];

  for (const log of logs) {
    const project = log.ticket.project;
    const hourlyRate = rate(project);
    const amount = hourlyRate != null ? log.hours * hourlyRate : null;
    const ticketKey = `${project.key}-${log.ticket.number}`;

    let projectRow = projects.get(project.id);
    if (!projectRow) {
      projectRow = {
        projectId: project.id,
        key: project.key,
        name: project.name,
        clientName: project.client?.name ?? null,
        budgetType: project.budgetType,
        currency: project.currency,
        hourlyRate: project.hourlyRate,
        contractAmount:
          project.budgetType === "FIXED" ? project.fixedAmount : null,
        hours: 0,
        agentHours: 0,
        amount: hourlyRate != null ? 0 : null,
        entries: 0,
      };
      projects.set(project.id, projectRow);
    }
    projectRow.hours += log.hours;
    if (log.source === "AGENT") projectRow.agentHours += log.hours;
    projectRow.entries += 1;
    if (projectRow.amount != null && amount != null)
      projectRow.amount += amount;

    const personRow = people.get(log.userId) ?? {
      id: log.userId,
      label: log.user.name,
      sublabel: log.user.position ?? undefined,
      color: log.user.avatarColor,
      hours: 0,
      amount: 0,
      currency: project.currency,
    };
    personRow.hours += log.hours;
    if (personRow.amount != null) {
      personRow.amount =
        amount != null ? personRow.amount + amount : personRow.amount;
    }
    people.set(log.userId, personRow);

    const ticketRow = tickets.get(log.ticketId) ?? {
      id: log.ticketId,
      label: log.ticket.title,
      sublabel: ticketKey,
      hours: 0,
      amount: 0,
      currency: project.currency,
    };
    ticketRow.hours += log.hours;
    if (ticketRow.amount != null) {
      ticketRow.amount =
        amount != null ? ticketRow.amount + amount : ticketRow.amount;
    }
    tickets.set(log.ticketId, ticketRow);

    entries.push({
      id: log.id,
      date: dayKey(log.spentOn),
      projectKey: project.key,
      projectName: project.name,
      ticketKey,
      ticketTitle: log.ticket.title,
      personName: log.user.name,
      source: log.source,
      hours: log.hours,
      amount,
      currency: project.currency,
      description: log.description,
    });
  }

  const totals = new Map<
    string,
    { currency: string; hours: number; amount: number }
  >();
  for (const row of projects.values()) {
    const bucket = totals.get(row.currency) ?? {
      currency: row.currency,
      hours: 0,
      amount: 0,
    };
    bucket.hours += row.hours;
    bucket.amount += row.amount ?? 0;
    totals.set(row.currency, bucket);
  }

  const round = <T extends { hours: number; amount: number | null }>(
    row: T,
  ) => ({
    ...row,
    hours: Math.round(row.hours * 100) / 100,
    amount: row.amount == null ? null : Math.round(row.amount * 100) / 100,
  });

  return {
    from: options.from,
    to: options.to,
    projects: [...projects.values()]
      .map(round)
      .sort((a, b) => b.hours - a.hours),
    byPerson: [...people.values()].map(round).sort((a, b) => b.hours - a.hours),
    byTicket: [...tickets.values()]
      .map(round)
      .sort((a, b) => b.hours - a.hours),
    entries,
    totalsByCurrency: [...totals.values()].map((t) => ({
      ...t,
      hours: Math.round(t.hours * 100) / 100,
      amount: Math.round(t.amount * 100) / 100,
    })),
    totalHours: Math.round(logs.reduce((s, l) => s + l.hours, 0) * 100) / 100,
    totalAgentHours:
      Math.round(
        logs
          .filter((l) => l.source === "AGENT")
          .reduce((s, l) => s + l.hours, 0) * 100,
      ) / 100,
  };
}

/** Escapes a value for CSV — quotes are doubled, the field always wrapped. */
function csvCell(value: string | number | null) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * The sheet that goes out with an invoice. The "Done by" column is only added
 * when the studio has chosen to show agent work: disclosing it is a decision,
 * and it should not leak into a client's spreadsheet by default.
 */
export function reportToCsv(report: Report, { showAgentHours = false } = {}) {
  const header = [
    "Date",
    "Project key",
    "Project",
    "Ticket",
    "Ticket title",
    "Person",
    ...(showAgentHours ? ["Done by"] : []),
    "Hours",
    "Amount",
    "Currency",
    "Note",
  ];

  const lines = [header.map(csvCell).join(",")];

  for (const entry of report.entries) {
    lines.push(
      [
        entry.date,
        entry.projectKey,
        entry.projectName,
        entry.ticketKey,
        entry.ticketTitle,
        entry.personName,
        ...(showAgentHours
          ? [entry.source === "AGENT" ? "agent" : "person"]
          : []),
        entry.hours,
        entry.amount ?? "",
        entry.currency,
        entry.description ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return lines.join("\r\n");
}
