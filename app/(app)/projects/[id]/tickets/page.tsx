import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { projectAssignees } from "@/lib/queries";
import {
  priorityColors,
  priorityLabels,
  ticketTypeColors,
  ticketTypeLabels,
} from "@/lib/labels";
import { formatDate, formatHours, ticketKey } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Card,
  Dot,
  EmptyState,
} from "@/components/ui/primitives";
import { CreateTicketButton } from "@/components/project/create-ticket-button";

export default async function ProjectTicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    statusId?: string;
    assigneeId?: string;
    type?: string;
    priority?: string;
  }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  const filters = await searchParams;
  if (!(await canAccessProject(user, id))) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      workflow: { include: { statuses: { orderBy: { position: "asc" } } } },
    },
  });
  if (!project) notFound();

  const tickets = await prisma.ticket.findMany({
    where: {
      projectId: id,
      ...(filters.statusId ? { statusId: filters.statusId } : {}),
      ...(filters.assigneeId
        ? filters.assigneeId === "none"
          ? { assigneeId: null }
          : { assigneeId: filters.assigneeId }
        : {}),
      ...(filters.type ? { type: filters.type as never } : {}),
      ...(filters.priority ? { priority: filters.priority as never } : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q, mode: "insensitive" as const } },
              {
                description: {
                  contains: filters.q,
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ number: "desc" }],
    include: {
      status: true,
      assignee: true,
      workLogs: { select: { hours: true } },
      _count: { select: { comments: true, attachments: true } },
    },
  });

  const assignees = await projectAssignees(id);
  const canEdit = canEditProject(user);

  return (
    <div className="space-y-4">
      {/* The filters are a form, and New ticket opens a form of its own. They
          have to be siblings: a form nested inside a form is not something the
          DOM keeps — React refuses the inner submit and the button silently
          does nothing, which is exactly what it used to do here. */}
      <div className="flex flex-wrap items-end gap-2">
        <form
          className="flex flex-wrap items-end gap-2"
          action={`/projects/${id}/tickets`}
        >
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-faint)]"
            />
            <input
              name="q"
              defaultValue={filters.q}
              aria-label="Search tickets"
              placeholder="Search tickets"
              className="field w-60 pl-9"
            />
          </div>

          <select
            name="statusId"
            aria-label="Filter by status"
            defaultValue={filters.statusId ?? ""}
            className="field w-44"
          >
            <option value="">All statuses</option>
            {project.workflow.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            name="assigneeId"
            aria-label="Filter by assignee"
            defaultValue={filters.assigneeId ?? ""}
            className="field w-44"
          >
            <option value="">All assignees</option>
            <option value="none">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            name="type"
            aria-label="Filter by type"
            defaultValue={filters.type ?? ""}
            className="field w-36"
          >
            <option value="">All types</option>
            {Object.entries(ticketTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            name="priority"
            aria-label="Filter by priority"
            defaultValue={filters.priority ?? ""}
            className="field w-36"
          >
            <option value="">Any priority</option>
            {Object.entries(priorityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="field w-auto cursor-pointer px-4 font-medium"
          >
            Apply
          </button>
        </form>

        <div className="ml-auto">
          {canEdit ? (
            <CreateTicketButton
              projectId={project.id}
              assignees={assignees}
              statuses={project.workflow.statuses.map((s) => ({
                id: s.id,
                name: s.name,
              }))}
            />
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden">
        {tickets.length === 0 ? (
          <EmptyState
            title="No tickets found"
            description="Adjust the filters or create a new ticket."
          />
        ) : (
          <div className="hidden overflow-x-auto scroll-thin md:block">
            <table className="table-base min-w-[900px]">
              <thead>
                <tr>
                  <th className="w-24">Key</th>
                  <th>Ticket</th>
                  <th className="w-40">Status</th>
                  <th className="w-32">Priority</th>
                  <th className="w-32">Est. / actual</th>
                  <th className="w-32">Due</th>
                  <th className="w-14">Assignee</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const spent = ticket.workLogs.reduce(
                    (s, w) => s + w.hours,
                    0,
                  );
                  return (
                    <tr
                      key={ticket.id}
                      className="transition hover:bg-[var(--color-hover)]"
                    >
                      <td className="font-mono text-[12px] text-[var(--color-muted)]">
                        <Link href={`/tickets/${ticket.id}`}>
                          {ticketKey(project.key, ticket.number)}
                        </Link>
                      </td>
                      <td>
                        <Link href={`/tickets/${ticket.id}`} className="block">
                          <span className="font-medium">{ticket.title}</span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <Badge color={ticketTypeColors[ticket.type]}>
                              {ticketTypeLabels[ticket.type]}
                            </Badge>
                            {ticket._count.comments > 0 ? (
                              <span className="text-[11.5px] text-[var(--color-muted)]">
                                {ticket._count.comments} comments
                              </span>
                            ) : null}
                            {ticket._count.attachments > 0 ? (
                              <span className="text-[11.5px] text-[var(--color-muted)]">
                                {ticket._count.attachments} files
                              </span>
                            ) : null}
                            {ticket.isClientVisible ? (
                              <span className="text-[11.5px] text-[var(--color-ok)]">
                                visible to client
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <Badge color={ticket.status.color}>
                          <Dot color={ticket.status.color} />
                          {ticket.status.name}
                        </Badge>
                      </td>
                      <td>
                        <Badge color={priorityColors[ticket.priority]}>
                          {priorityLabels[ticket.priority]}
                        </Badge>
                      </td>
                      <td className="text-[13px]">
                        {formatHours(ticket.estimate)} /{" "}
                        <span
                          className={
                            ticket.estimate != null && spent > ticket.estimate
                              ? "font-medium text-[var(--color-danger)]"
                              : ""
                          }
                        >
                          {formatHours(spent)}
                        </span>
                      </td>
                      <td className="text-[13px]">
                        {formatDate(ticket.dueDate)}
                      </td>
                      <td>
                        {ticket.assignee ? (
                          <Avatar
                            name={ticket.assignee.name}
                            color={ticket.assignee.avatarColor}
                            size={24}
                          />
                        ) : (
                          <span className="text-[13px] text-[var(--color-muted)]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Same tickets as rows on a phone. */}
        {tickets.length > 0 ? (
          <ul className="divide-y divide-[var(--color-line)] md:hidden">
            {tickets.map((ticket) => {
              const spent = ticket.workLogs.reduce((s, w) => s + w.hours, 0);
              return (
                <li key={ticket.id}>
                  <Link
                    href={`/tickets/${ticket.id}`}
                    className="block px-4 py-3.5"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="num font-mono text-[11.5px] text-[var(--color-muted)]">
                        {ticketKey(project.key, ticket.number)}
                      </span>
                      <span className="min-w-0 flex-1 font-medium">
                        {ticket.title}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge color={ticket.status.color}>
                        <Dot color={ticket.status.color} />
                        {ticket.status.name}
                      </Badge>
                      <Badge color={priorityColors[ticket.priority]}>
                        {priorityLabels[ticket.priority]}
                      </Badge>
                      <span className="num text-[12px] text-[var(--color-muted)]">
                        {formatHours(ticket.estimate)} / {formatHours(spent)}
                      </span>
                      {ticket.dueDate ? (
                        <span className="num text-[12px] text-[var(--color-muted)]">
                          due {formatDate(ticket.dueDate)}
                        </span>
                      ) : null}
                      {ticket.assignee ? (
                        <Avatar
                          name={ticket.assignee.name}
                          color={ticket.assignee.avatarColor}
                          size={20}
                        />
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
