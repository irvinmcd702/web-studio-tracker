"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, MoveRight } from "lucide-react";

import { moveTicketTo } from "@/app/actions/tickets";
import { Avatar, Badge } from "@/components/ui/primitives";
import {
  priorityColors,
  priorityLabels,
  ticketTypeColors,
  ticketTypeLabels,
} from "@/lib/labels";
import { cn, formatDate, formatHours, ticketKey } from "@/lib/utils";

export type BoardStatus = {
  id: string;
  name: string;
  color: string;
  category: string;
};

export type BoardTicket = {
  id: string;
  number: number;
  title: string;
  type: string;
  priority: string;
  statusId: string;
  estimate: number | null;
  dueDate: string | null;
  assignee: { name: string; avatarColor: string } | null;
};

export function Board({
  projectKey,
  statuses,
  tickets: initialTickets,
  transitions,
  canEdit,
}: {
  projectKey: string;
  statuses: BoardStatus[];
  tickets: BoardTicket[];
  /** statusId → ids it may move to */
  transitions: Record<string, string[]>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [dragging, setDragging] = useState<BoardTicket | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Server data wins whenever the route revalidates.
  const [synced, setSynced] = useState(initialTickets);
  if (synced !== initialTickets) {
    setSynced(initialTickets);
    setTickets(initialTickets);
  }

  const allowed = (ticket: BoardTicket | null, statusId: string) => {
    if (!ticket) return false;
    if (ticket.statusId === statusId) return true;
    return (transitions[ticket.statusId] ?? []).includes(statusId);
  };

  function drop(statusId: string) {
    const ticket = dragging;
    setDragging(null);
    setOverStatus(null);
    move(ticket, statusId);
  }

  function move(ticket: BoardTicket | null, statusId: string) {
    if (!ticket || ticket.statusId === statusId) return;

    if (!allowed(ticket, statusId)) {
      setError("The project workflow doesn't allow this transition");
      return;
    }

    const previous = ticket.statusId;
    setError(null);
    setTickets((current) =>
      current.map((t) => (t.id === ticket.id ? { ...t, statusId } : t)),
    );

    startTransition(async () => {
      const result = await moveTicketTo(ticket.id, statusId);
      if (result.error) {
        setError(result.error);
        setTickets((current) =>
          current.map((t) =>
            t.id === ticket.id ? { ...t, statusId: previous } : t,
          ),
        );
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-[13px] text-[var(--color-danger)]">
          <AlertCircle size={15} />
          {error}
        </div>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-3 scroll-thin">
        {statuses.map((status) => {
          const items = tickets.filter((t) => t.statusId === status.id);
          const isTarget = dragging ? allowed(dragging, status.id) : false;
          const isOver = overStatus === status.id;

          return (
            <div
              key={status.id}
              onDragOver={(e) => {
                if (!canEdit || !dragging) return;
                e.preventDefault();
                setOverStatus(status.id);
              }}
              onDragLeave={() =>
                setOverStatus((s) => (s === status.id ? null : s))
              }
              onDrop={(e) => {
                e.preventDefault();
                drop(status.id);
              }}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border bg-[var(--color-surface-2)]/70 transition",
                isOver && isTarget
                  ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]/60"
                  : "border-[var(--color-line)]",
                dragging && !isTarget && "opacity-50",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: status.color }}
                  />
                  {status.name}
                </span>
                <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11.5px] font-medium text-[var(--color-muted)]">
                  {items.length}
                </span>
              </div>

              <div className="flex-1 space-y-2 p-2">
                {items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-[12.5px] text-[var(--color-muted)]">
                    Empty
                  </p>
                ) : (
                  items.map((ticket) => (
                    <div
                      key={ticket.id}
                      draggable={canEdit}
                      onDragStart={() => setDragging(ticket)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOverStatus(null);
                      }}
                      className={cn(
                        "relative rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3 shadow-sm transition hover:border-[var(--color-line-strong)] hover:shadow",
                        canEdit && "cursor-grab active:cursor-grabbing",
                        dragging?.id === ticket.id && "opacity-40",
                      )}
                    >
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-[var(--color-muted)]">
                          {ticketKey(projectKey, ticket.number)}
                        </span>
                        <Badge color={ticketTypeColors[ticket.type]}>
                          {ticketTypeLabels[ticket.type]}
                        </Badge>

                        {canEdit ? (
                          <button
                            type="button"
                            title="Move"
                            onClick={() =>
                              setMenuFor((id) =>
                                id === ticket.id ? null : ticket.id,
                              )
                            }
                            className="ml-auto rounded p-1 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
                          >
                            <MoveRight size={14} />
                          </button>
                        ) : null}
                      </div>

                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="block text-[13.5px] font-medium leading-snug hover:text-[var(--color-brand)]"
                      >
                        {ticket.title}
                      </Link>

                      <div className="mt-2.5 flex items-center gap-2">
                        <Badge color={priorityColors[ticket.priority]}>
                          {priorityLabels[ticket.priority]}
                        </Badge>
                        {ticket.estimate ? (
                          <span className="text-[11.5px] text-[var(--color-muted)]">
                            {formatHours(ticket.estimate)}
                          </span>
                        ) : null}
                        {ticket.dueDate ? (
                          <span className="text-[11.5px] text-[var(--color-muted)]">
                            {formatDate(ticket.dueDate)}
                          </span>
                        ) : null}
                        <span className="ml-auto">
                          {ticket.assignee ? (
                            <Avatar
                              name={ticket.assignee.name}
                              color={ticket.assignee.avatarColor}
                              size={20}
                            />
                          ) : null}
                        </span>
                      </div>

                      {menuFor === ticket.id ? (
                        <div className="absolute right-2 top-9 z-20 w-56 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1 shadow-lg">
                          <p className="px-2 py-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
                            Move to
                          </p>
                          {statuses
                            .filter(
                              (s) =>
                                allowed(ticket, s.id) &&
                                s.id !== ticket.statusId,
                            )
                            .map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  setMenuFor(null);
                                  move(ticket, s.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition hover:bg-[var(--color-hover-strong)]"
                              >
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: s.color }}
                                />
                                {s.name}
                              </button>
                            ))}
                          {statuses.filter(
                            (s) =>
                              allowed(ticket, s.id) && s.id !== ticket.statusId,
                          ).length === 0 ? (
                            <p className="px-2 py-1.5 text-[12.5px] text-[var(--color-muted)]">
                              No transitions out of this status
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
