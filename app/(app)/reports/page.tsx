import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canConfigure, projectScope } from "@/lib/permissions";
import { PERIOD_PRESETS, buildReport, resolvePeriod } from "@/lib/reports";
import { getStudioSettings } from "@/lib/settings";
import { budgetTypeLabels } from "@/lib/labels";
import { dayKey } from "@/lib/time";
import { formatDate, formatHours, formatMoney } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Stat,
} from "@/components/ui/primitives";
import { PrintButton } from "@/components/reports/print-button";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    projectId?: string;
    clientId?: string;
  }>;
}) {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const params = await searchParams;
  const period = resolvePeriod(params);
  const scope = projectScope(user);

  const [report, projects, clients, studio] = await Promise.all([
    buildReport({
      from: period.from,
      to: period.to,
      scope,
      projectId: params.projectId || undefined,
      clientId: params.clientId || undefined,
    }),
    prisma.project.findMany({
      where: scope,
      orderBy: { name: "asc" },
      select: { id: true, key: true, name: true },
    }),
    prisma.client.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getStudioSettings(),
  ]);

  // The split is only ever shown when the studio asked for it.
  const showAgentHours = studio.agentHoursVisible && report.totalAgentHours > 0;

  const singleProject = params.projectId
    ? report.projects.find((p) => p.projectId === params.projectId)
    : null;

  const filterLine = [
    params.clientId
      ? clients.find((c) => c.id === params.clientId)?.name
      : null,
    params.projectId
      ? projects.find((pr) => pr.id === params.projectId)?.name
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const query = new URLSearchParams();
  if (params.preset) query.set("preset", params.preset);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.projectId) query.set("projectId", params.projectId);
  if (params.clientId) query.set("clientId", params.clientId);

  return (
    <>
      {/* Only on paper: the sheet is handed to a client next to an invoice,
          so it has to name itself without the app around it. */}
      <div className="print-only mb-5 border-b border-[var(--color-line)] pb-3">
        <p className="text-[15px] font-semibold">
          Studio Tracker — time report
        </p>
        <p className="num mt-1 text-[12.5px]">
          {formatDate(period.from)} — {formatDate(period.to)}
          {filterLine ? ` · ${filterLine}` : ""}
        </p>
        <p className="num mt-0.5 text-[12px] text-[var(--color-muted)]">
          Generated {formatDate(new Date())}
        </p>
      </div>

      <div className="print-hide">
        <PageHeader
          title="Reports"
          description={`${formatDate(period.from)} — ${formatDate(period.to)}`}
          action={
            <span className="flex items-center gap-2 print-hide">
              <PrintButton />
              <a
                href={`/api/reports/csv?${query.toString()}`}
                className={buttonClass("secondary", "md")}
              >
                <Download size={15} />
                CSV
              </a>
            </span>
          }
        />
      </div>

      <Card className="mb-6 p-4 print-hide">
        <form className="flex flex-wrap items-end gap-3" action="/reports">
          <label className="block">
            <span className="label">Period</span>
            <select
              name="preset"
              defaultValue={period.preset}
              className="field w-44"
            >
              {PERIOD_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">From</span>
            <input
              type="date"
              name="from"
              defaultValue={params.from ?? dayKey(period.from)}
              className="field w-40"
            />
          </label>

          <label className="block">
            <span className="label">To</span>
            <input
              type="date"
              name="to"
              defaultValue={params.to ?? dayKey(period.to)}
              className="field w-40"
            />
          </label>

          <label className="block">
            <span className="label">Client</span>
            <select
              name="clientId"
              defaultValue={params.clientId ?? ""}
              className="field w-full sm:w-48"
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Project</span>
            <select
              name="projectId"
              defaultValue={params.projectId ?? ""}
              className="field w-full sm:w-56"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key} · {p.name}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className={buttonClass("primary", "md")}>
            Apply
          </button>
        </form>
        <p className="mt-2 text-[12px] text-[var(--color-muted)]">
          Dates apply when the period is set to “Custom range”.
        </p>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Hours in period"
          value={formatHours(report.totalHours)}
          sub={
            showAgentHours
              ? `${formatHours(report.totalAgentHours)} with an agent`
              : undefined
          }
        />
        <Stat label="Projects" value={report.projects.length} />
        <Stat
          label="Billable"
          value={
            report.totalsByCurrency.length === 0
              ? "—"
              : report.totalsByCurrency
                  .map((t) => formatMoney(t.amount, t.currency))
                  .join(" · ")
          }
          sub="Hourly projects only"
        />
      </div>

      {report.entries.length === 0 ? (
        <Card>
          <EmptyState
            title="No time logged in this period"
            description="Pick another period, or check that the filters aren't too narrow."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader
              title="By project"
              description={`${report.projects.length} project(s) with logged time`}
            />
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base min-w-[760px]">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th className="w-32">Billing</th>
                    <th className="w-24 text-right">Hours</th>
                    <th className="w-32 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.projects.map((row) => (
                    <tr key={row.projectId}>
                      <td>
                        <Link
                          href={`/reports?${new URLSearchParams({
                            ...Object.fromEntries(query),
                            projectId: row.projectId,
                          }).toString()}`}
                          className="block"
                        >
                          <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-ink-2)]">
                            {row.key}
                          </span>
                          <span className="ml-2 text-[13.5px] font-medium hover:underline">
                            {row.name}
                          </span>
                        </Link>
                      </td>
                      <td className="text-[13px]">{row.clientName ?? "—"}</td>
                      <td className="text-[13px]">
                        {budgetTypeLabels[row.budgetType]}
                        {row.hourlyRate ? (
                          <span className="block text-[11.5px] text-[var(--color-muted)]">
                            {formatMoney(row.hourlyRate, row.currency)}/h
                          </span>
                        ) : null}
                      </td>
                      <td className="text-right text-[13px] font-medium">
                        {formatHours(row.hours)}
                      </td>
                      <td className="text-right text-[13px]">
                        {row.amount != null ? (
                          <span className="font-medium">
                            {formatMoney(row.amount, row.currency)}
                          </span>
                        ) : (
                          <span
                            className="text-[var(--color-muted)]"
                            title="Fixed-price project — the period has no hourly amount"
                          >
                            fixed{" "}
                            {row.contractAmount != null
                              ? formatMoney(row.contractAmount, row.currency)
                              : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {report.totalsByCurrency.map((total) => (
                    <tr
                      key={total.currency}
                      className="bg-[var(--color-surface-2)]/70"
                    >
                      <td colSpan={3} className="text-[13px] font-semibold">
                        Total, {total.currency}
                      </td>
                      <td className="text-right text-[13px] font-semibold">
                        {formatHours(total.hours)}
                      </td>
                      <td className="text-right text-[13px] font-semibold">
                        {formatMoney(total.amount, total.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {singleProject ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="overflow-hidden">
                <CardHeader title="By person" />
                <table className="table-base">
                  <tbody>
                    {report.byPerson.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className="flex items-center gap-2.5">
                            <Avatar
                              name={row.label}
                              color={row.color ?? "#6366f1"}
                              size={28}
                            />
                            <span>
                              <span className="block text-[13.5px]">
                                {row.label}
                              </span>
                              {row.sublabel ? (
                                <span className="block text-[11.5px] text-[var(--color-muted)]">
                                  {row.sublabel}
                                </span>
                              ) : null}
                            </span>
                          </span>
                        </td>
                        <td className="w-24 text-right text-[13px] font-medium">
                          {formatHours(row.hours)}
                        </td>
                        <td className="w-32 text-right text-[13px] text-[var(--color-muted)]">
                          {row.amount
                            ? formatMoney(row.amount, row.currency)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card className="overflow-hidden">
                <CardHeader title="By ticket" />
                <table className="table-base">
                  <tbody>
                    {report.byTicket.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={`/tickets/${row.id}`} className="block">
                            <span className="font-mono text-[11.5px] text-[var(--color-muted)]">
                              {row.sublabel}
                            </span>
                            <span className="block text-[13.5px] hover:underline">
                              {row.label}
                            </span>
                          </Link>
                        </td>
                        <td className="w-24 text-right text-[13px] font-medium">
                          {formatHours(row.hours)}
                        </td>
                        <td className="w-32 text-right text-[13px] text-[var(--color-muted)]">
                          {row.amount
                            ? formatMoney(row.amount, row.currency)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader
              title="Time entries"
              description={`${report.entries.length} entries — this is the detail behind the totals`}
            />
            <div className="overflow-x-auto scroll-thin">
              <table className="table-base min-w-[900px]">
                <thead>
                  <tr>
                    <th className="w-28">Date</th>
                    <th className="w-24">Project</th>
                    <th>Ticket</th>
                    <th className="w-40">Person</th>
                    <th>Note</th>
                    <th className="w-20 text-right">Hours</th>
                    <th className="w-28 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {report.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap text-[13px]">
                        {entry.date}
                      </td>
                      <td className="font-mono text-[11.5px] text-[var(--color-muted)]">
                        {entry.projectKey}
                      </td>
                      <td className="text-[13px]">
                        <span className="font-mono text-[11.5px] text-[var(--color-muted)]">
                          {entry.ticketKey}
                        </span>{" "}
                        {entry.ticketTitle}
                      </td>
                      <td className="text-[13px]">{entry.personName}</td>
                      <td className="text-[13px] text-[var(--color-muted)]">
                        {entry.description ?? "—"}
                      </td>
                      <td className="text-right text-[13px]">
                        {formatHours(entry.hours)}
                      </td>
                      <td className="text-right text-[13px]">
                        {entry.amount != null
                          ? formatMoney(entry.amount, entry.currency)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
