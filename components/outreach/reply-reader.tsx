"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Inbox, Sparkles } from "lucide-react";

import {
  proposeRequestFromReplyAction,
  readReplyAction,
  sendReplyAction,
} from "@/app/actions/outreach-ai";
import { Button } from "@/components/ui/button";
import {
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

/**
 * Reading one reply with a model, and then deciding.
 *
 * The reading writes a diary line saying what it thought and changes nothing
 * else. What follows is two separate acts by a person: sending an answer,
 * where the body posted is the body on screen, and filing a request — which is
 * the one thing here that writes by itself, and only when the reading came
 * back interested with high confidence.
 */
export function ReplyReader({
  messageId,
  subject,
  hasLead,
}: {
  messageId: string;
  subject: string;
  hasLead: boolean;
}) {
  const [reading, read] = useActionState(readReplyAction, null);
  const [sent, send] = useActionState(sendReplyAction, null);
  const [filed, file] = useActionState(proposeRequestFromReplyAction, null);
  const router = useRouter();

  useEffect(() => {
    if (sent?.ok || filed?.ok) router.refresh();
  }, [sent, filed, router]);

  return (
    <div className="mt-3 space-y-3">
      <form action={read} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="id" value={messageId} />
        <SubmitButton size="sm" variant="secondary" pendingText="Reading…">
          <Sparkles size={14} />
          Read this with a model
        </SubmitButton>
        <span className="text-[12px] text-[var(--color-muted)]">
          Writes down what it thought. Sends nothing and decides nothing.
        </span>
      </form>

      <FormError message={reading?.error} />

      {reading?.ok ? (
        <div className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-2)] p-4">
          <p className="text-[13px]">
            <span className="font-medium">
              Read as {reading.intent?.replace(/_/g, " ")}
            </span>
            <span className="text-[var(--color-muted)]">
              {" "}
              · {reading.confidence} confidence
            </span>
          </p>
          {reading.summary ? (
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
              {reading.summary}
            </p>
          ) : null}

          {reading.intent === "unsubscribe" ? (
            // The model does not get to write into the suppression list. The
            // sequence is already stopped — every inbound stops it — so nothing
            // goes out while a person decides.
            <p className="mt-3 rounded-[var(--radius-field)] bg-[var(--color-danger-soft)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--color-danger)]">
              This reads like somebody asking to be left alone. Nothing further
              will be sent to them either way — the sequence stopped when they
              wrote. Suppress the address yourself if you agree; the tracker
              will not do it on a model&rsquo;s reading.
            </p>
          ) : null}

          {hasLead && reading.suggestedReply ? (
            <form action={send} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={messageId} />
              <FormError message={sent?.error} />
              {sent?.ok ? (
                <p className="text-[12.5px] text-[var(--color-ok)]">Sent.</p>
              ) : null}

              <div>
                <label className="label" htmlFor={`subject-${messageId}`}>
                  Subject
                </label>
                <Input
                  id={`subject-${messageId}`}
                  name="subject"
                  defaultValue={`Re: ${subject}`}
                  maxLength={200}
                />
              </div>

              <div>
                <label className="label" htmlFor={`body-${messageId}`}>
                  Reply
                </label>
                <Textarea
                  id={`body-${messageId}`}
                  name="body"
                  rows={7}
                  defaultValue={reading.suggestedReply}
                  maxLength={4000}
                  className="resize-y"
                />
                <p className="hint">
                  What goes out is what is in this box, plus the footer. Edit it.
                </p>
              </div>

              <SubmitButton size="sm" pendingText="Sending…">
                Send this reply
              </SubmitButton>
            </form>
          ) : null}

          {reading.canFileRequest ? (
            <form action={file} className="mt-4 space-y-2">
              <input type="hidden" name="id" value={messageId} />
              <FormError message={filed?.error} />
              {filed?.ok ? (
                <p className="text-[12.5px] text-[var(--color-ok)]">
                  Filed in the requests inbox, marked as filed by the tracker.
                </p>
              ) : (
                <>
                  <SubmitButton size="sm" variant="secondary" pendingText="Filing…">
                    <Inbox size={14} />
                    File this as a request
                  </SubmitButton>
                  <p className="hint">
                    Offered only because the reading came back interested with
                    high confidence. It lands in the same inbox the public form
                    feeds, in New, marked as filed by the tracker.
                  </p>
                </>
              )}
            </form>
          ) : reading.intent === "interested" ? (
            <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">
              Reads as interested, but not confidently enough for the tracker to
              file a request by itself. Do it from their page if you agree.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
