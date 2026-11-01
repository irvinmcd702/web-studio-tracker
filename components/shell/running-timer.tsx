"use client";

import Link from "next/link";
import { Square, Timer } from "lucide-react";

import { stopTimerAction } from "@/app/actions/timer";
import { RunningClock } from "@/components/timer/timer-button";

/**
 * Always-visible reminder that the stopwatch is running, so nobody leaves one
 * ticking overnight.
 */
export function RunningTimerBadge({
  ticketId,
  ticketKey,
  title,
  startedAt,
}: {
  ticketId: string;
  ticketKey: string;
  title: string;
  startedAt: string;
}) {
  return (
    <div className="mb-3 rounded-lg border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2.5">
      <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--color-ok)]">
        <Timer size={14} />
        <RunningClock startedAt={startedAt} />
      </div>
      <Link
        href={`/tickets/${ticketId}`}
        className="mt-1 block truncate text-[12.5px] text-[var(--color-ok)] hover:underline"
        title={title}
      >
        <span className="font-mono text-[11px]">{ticketKey}</span> {title}
      </Link>
      <form action={stopTimerAction} className="mt-2">
        <button
          type="submit"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-surface)] px-2 py-1.5 text-[12px] font-medium text-[var(--color-ok)] transition hover:bg-[var(--color-ok-soft)]"
        >
          <Square size={13} />
          Stop and log
        </button>
      </form>
    </div>
  );
}
