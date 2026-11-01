import { Bot, Pin } from "lucide-react";

import type { TimelineEntries, TimelineTarget } from "@/lib/timeline";
import { actorKindLabels, timelineKindColors, timelineKindLabels } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { Avatar, Badge, Card, CardHeader, Dot, EmptyState } from "@/components/ui/primitives";
import { NoteForm } from "./note-form";

/**
 * The diary, rendered the same way wherever it appears.
 *
 * One component for clients and requests because the entries are one table and
 * one shape; a reader who has learned to scan it on one page should not have
 * to learn it again on the next.
 *
 * The page does the reading and passes the rows in, rather than this fetching
 * its own. Every other list on these pages works that way, and a client form
 * sitting inside a component that fetches is a form that gets re-rendered out
 * from under itself the moment its own action revalidates the route.
 */
export function Timeline({
  entries,
  target,
  canAddNote = false,
}: {
  entries: TimelineEntries;
  target: TimelineTarget;
  canAddNote?: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="History"
        description={
          entries.length ? `${entries.length} entries, newest first` : undefined
        }
      />

      {canAddNote ? (
        <div className="border-b border-[var(--color-line)] px-5 py-4">
          <NoteForm
            clientId={target.clientId ?? undefined}
            requestId={target.requestId ?? undefined}
            leadId={target.leadId ?? undefined}
          />
        </div>
      ) : null}

      {entries.length === 0 ? (
        // Honest about what it is: the diary starts the day it was switched
        // on, and saying anything else would be a lie about history.
        <EmptyState
          title="Nothing recorded yet"
          description="Entries start from the day this was switched on — what happened before it is not here."
        />
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {entries.map((entry) => (
            <li key={entry.id} className="px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Badge color={timelineKindColors[entry.kind]}>
                  <Dot color={timelineKindColors[entry.kind]!} />
                  {timelineKindLabels[entry.kind]}
                </Badge>
                {entry.isPinned ? (
                  <Pin
                    size={12}
                    aria-label="Pinned"
                    className="text-[var(--color-muted)]"
                  />
                ) : null}
                <span className="ml-auto shrink-0 text-[12px] text-[var(--color-muted)]">
                  {formatDateTime(entry.createdAt)}
                </span>
              </div>

              <p className="mt-1.5 text-[13.5px] leading-relaxed">
                {entry.summary}
              </p>

              {entry.body ? (
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-ink-2)]">
                  {entry.body}
                </p>
              ) : null}

              <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">
                {entry.actorKind === "HUMAN" && entry.user ? (
                  <>
                    <Avatar
                      name={entry.user.name}
                      color={entry.user.avatarColor}
                      size={18}
                    />
                    {entry.user.name}
                  </>
                ) : entry.actorKind === "MACHINE" ? (
                  <>
                    <Bot size={13} aria-hidden="true" />
                    {actorKindLabels.MACHINE}
                  </>
                ) : entry.actorKind === "CONTACT" ? (
                  actorKindLabels.CONTACT
                ) : (
                  // A human entry whose author has since left the studio. The
                  // text stays, the name does not — same bargain as every
                  // other authored row here.
                  "Somebody who has since left"
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
