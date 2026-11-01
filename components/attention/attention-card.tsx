import Link from "next/link";
import {
  AlarmClock,
  AtSign,
  CalendarClock,
  Gauge,
  MessageSquareWarning,
  PauseCircle,
  Reply,
  Send,
  Stamp,
  Timer,
} from "lucide-react";

import type { Signal, SignalKind } from "@/lib/attention";
import { Card, CardHeader } from "@/components/ui/primitives";

/**
 * What the tracker would tell you if you asked it what is going wrong.
 *
 * It only renders when there is something to say. An empty "nothing needs
 * attention" panel is a panel people learn to skip past, and the point of this
 * one is that its presence means something.
 */

const ICONS: Record<SignalKind, typeof AlarmClock> = {
  "ticket.overdue": AlarmClock,
  "ticket.due_soon": CalendarClock,
  "ticket.stalled": PauseCircle,
  "project.overdue": AlarmClock,
  "project.due_soon": CalendarClock,
  "approval.waiting": Stamp,
  "chat.unanswered": MessageSquareWarning,
  "budget.pace": Gauge,
  "timer.running": Timer,
  "mention.unread": AtSign,
  "outreach.reply_unanswered": Reply,
  "outreach.approval_waiting": Send,
};

export function AttentionCard({
  signals,
  limit = 8,
}: {
  signals: Signal[];
  limit?: number;
}) {
  if (!signals.length) return null;

  const shown = signals.slice(0, limit);
  const high = signals.filter((s) => s.severity === "high").length;

  return (
    <Card className="mb-6">
      <CardHeader
        title="Needs attention"
        description={
          high > 0
            ? `${high} overdue of ${signals.length}`
            : `${signals.length} ${signals.length === 1 ? "item" : "items"}, none overdue`
        }
      />
      <ul className="divide-y divide-[var(--color-line)]">
        {shown.map((signal) => {
          const Icon = ICONS[signal.kind];
          const urgent = signal.severity === "high";

          return (
            <li key={signal.key}>
              <Link
                href={signal.href}
                className="flex items-start gap-3 px-5 py-3 transition hover:bg-[var(--color-hover)]"
              >
                <Icon
                  size={15}
                  className="mt-0.5 shrink-0"
                  style={{
                    color: urgent ? "var(--color-danger)" : "var(--color-warn)",
                  }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">
                    {signal.title}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-[var(--color-muted)]">
                    {signal.detail}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {signals.length > shown.length ? (
        <p className="border-t border-[var(--color-line)] px-5 py-2.5 text-[12.5px] text-[var(--color-muted)]">
          …and {signals.length - shown.length} more.
        </p>
      ) : null}
    </Card>
  );
}
