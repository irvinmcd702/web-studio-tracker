"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import {
  createTicketsFromMeetingAction,
  summariseMeetingAction,
} from "@/app/actions/meetings";
import { isEmptySummary, type MeetingSummary } from "@/lib/meetings";
import { Card, CardHeader } from "@/components/ui/primitives";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * What the model made of the meeting, next to what it can be turned into.
 *
 * Two forms rather than one: reading a transcript and committing work are
 * different decisions, taken at different moments by possibly different
 * people. Every action arrives unticked — a list that arrives pre-ticked is a
 * list nobody reads.
 */
export function MeetingSummaryPanel({
  meetingId,
  summary,
  partial,
  summarisedAt,
  canSummarise,
  canEdit,
  reason,
}: {
  meetingId: string;
  summary: MeetingSummary | null;
  partial: boolean;
  summarisedAt: string | null;
  canSummarise: boolean;
  canEdit: boolean;
  /** Why the button is missing, when it is. */
  reason: string;
}) {
  const router = useRouter();
  const [readState, readAction] = useActionState(summariseMeetingAction, null);
  const [ticketState, ticketAction] = useActionState(
    createTicketsFromMeetingAction,
    null,
  );

  useEffect(() => {
    if (readState?.ok || ticketState?.ok) router.refresh();
  }, [readState, ticketState, router]);

  const nothingFound = summary !== null && isEmptySummary(summary);

  return (
    <Card>
      <CardHeader
        title="What this meeting was about"
        description={summarisedAt ? `Read ${summarisedAt}` : "Not read yet"}
        action={
          canSummarise ? (
            <form action={readAction}>
              <input type="hidden" name="id" value={meetingId} />
              <SubmitButton
                size="sm"
                variant="secondary"
                pendingText="Reading…"
              >
                <Sparkles size={14} />
                {summary ? "Read again" : "Read the transcript"}
              </SubmitButton>
            </form>
          ) : null
        }
      />

      <div className="space-y-4 px-5 py-4">
        <FormError message={readState?.error ?? ticketState?.error} />

        {!canSummarise && !summary ? (
          <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-[12.5px] text-[var(--color-warn)]">
            {reason} The transcript is filed either way, and people can read it
            below.
          </p>
        ) : null}

        {partial ? (
          <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-[12.5px] text-[var(--color-warn)]">
            This transcript was too long to send whole, so the middle was left
            out and this is a summary of the rest. The full text is below,
            unchanged.
          </p>
        ) : null}

        {summary === null ? (
          <p className="text-[13px] text-[var(--color-muted)]">
            The transcript is filed. Reading it is a separate step, because it
            means sending a client&rsquo;s meeting to the model provider.
          </p>
        ) : nothingFound ? (
          <p className="text-[13px] text-[var(--color-muted)]">
            Nothing came out of this one: no subjects, no decisions, no actions.
            That is a real answer, and more often right than a list invented to
            fill the space.
          </p>
        ) : (
          <>
            <Section title="Discussed" items={summary.discussed} />
            <Section title="Decided" items={summary.decided} accent />

            {summary.actions.length > 0 ? (
              <div>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  To do
                </h3>

                <form action={ticketAction} className="space-y-2">
                  <input type="hidden" name="id" value={meetingId} />

                  {summary.actions.map((action, i) => (
                    <label
                      key={i}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-2)]"
                    >
                      <input
                        type="checkbox"
                        name="action"
                        value={i}
                        disabled={!canEdit}
                        className="mt-1 accent-[var(--color-brand)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13.5px] text-[var(--color-ink)]">
                          {action.what}
                        </span>
                        {action.who || action.when ? (
                          <span className="block text-[12px] text-[var(--color-muted)]">
                            {[
                              action.who ? `said for ${action.who}` : null,
                              action.when,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ))}

                  {canEdit ? (
                    <div className="flex items-center gap-3 pt-1">
                      <SubmitButton size="sm" pendingText="Creating…">
                        Make tickets from the ticked
                      </SubmitButton>
                      <span className="text-[12px] text-[var(--color-muted)]">
                        Nobody is assigned — a name heard in a room is not an
                        account.
                      </span>
                    </div>
                  ) : null}
                </form>
              </div>
            ) : null}

            <Section title="Left open" items={summary.questions} />

            <p className="border-t border-[var(--color-line)] pt-3 text-[12px] text-[var(--color-muted)]">
              Written by a model from the transcript below. It is a reading, not
              the record — where they disagree, the transcript is right.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function Section({
  title,
  items,
  accent = false,
}: {
  title: string;
  items: string[];
  accent?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {title}
      </h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li
            key={i}
            className={
              accent
                ? "rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13.5px] leading-relaxed text-[var(--color-ok)]"
                : "flex gap-2 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]"
            }
          >
            {accent ? null : (
              <span className="text-[var(--color-faint)]">—</span>
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
