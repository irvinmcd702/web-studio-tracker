"use client";

import { useActionState } from "react";

import {
  previewRetentionAction,
  updateRetentionAction,
} from "@/app/actions/settings";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * How long the studio's own history is kept.
 *
 * Zero keeps something forever, and the copy says outright that leaving them all
 * at zero is itself a decision — a default is not a policy, and a screen
 * that lets one pass for the other is doing the reader a disservice.
 */

type Values = {
  retainActivityDays: number;
  retainChatDays: number;
  retainAiUsageDays: number;
  retainMeetingDays: number;
};

const PERIODS: { name: keyof Values; label: string; help: string }[] = [
  {
    name: "retainActivityDays",
    label: "Activity feed",
    help: "Who did what, and when. Deleting it also removes the record of past erasures.",
  },
  {
    name: "retainChatDays",
    label: "Client chat",
    help: "What was agreed with a customer, in their own words. Think hard before putting a number here.",
  },
  {
    name: "retainAiUsageDays",
    label: "Model usage log",
    help: "Tokens, cost and which project each draft was for.",
  },
  {
    name: "retainMeetingDays",
    label: "Meeting transcripts",
    help: "Word-for-word speech, clients included, and the most personal thing here. Tickets made from a meeting survive it.",
  },
];

export function RetentionForm({
  values,
  fixed,
  lastRun,
}: {
  values: Values;
  fixed: { loginAttempts: string; authTokens: string; webhooks: string };
  lastRun: string | null;
}) {
  const [state, action] = useActionState(updateRetentionAction, null);
  const [preview, runPreview] = useActionState(previewRetentionAction, null);

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <FormError message={state?.error} />
        {state?.ok ? (
          <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
            Saved
          </p>
        ) : null}

        <div className="space-y-3">
          {PERIODS.map((period) => (
            <label key={period.name} className="block">
              <span className="flex items-center justify-between gap-3">
                <span className="text-[13.5px] font-medium">
                  {period.label}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <input
                    type="number"
                    name={period.name}
                    defaultValue={String(values[period.name])}
                    min={0}
                    max={3650}
                    step={1}
                    className="field num w-20 text-right"
                  />
                  <span className="text-[12.5px] text-[var(--color-muted)]">
                    days
                  </span>
                </span>
              </span>
              <span className="mt-0.5 block text-[12.5px] text-[var(--color-muted)]">
                {period.help}
              </span>
            </label>
          ))}
        </div>

        <p className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-3)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
          <span className="font-medium text-[var(--color-ink)]">
            Zero keeps it forever.
          </span>{" "}
          That is what every field starts at, so nothing was deleted by
          installing this. It is also not a policy — if you are asked how long
          you keep a customer&rsquo;s messages, &ldquo;forever, we never
          decided&rdquo; is the answer you would be giving. Projects, tickets,
          logged hours and files are never touched by this: they are the record
          of what was done and billed.
        </p>

        <SubmitButton size="sm">Save</SubmitButton>
      </form>

      <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
        <p className="text-[13px] font-semibold">Fixed periods</p>
        <dl className="grid gap-1.5 text-[12.5px]">
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-muted)]">Sign-in counters</dt>
            <dd>{fixed.loginAttempts}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-muted)]">Spent one-time links</dt>
            <dd>{fixed.authTokens}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-[var(--color-muted)]">Webhook delivery ids</dt>
            <dd>{fixed.webhooks}</dd>
          </div>
        </dl>
        <p className="text-[12.5px] text-[var(--color-muted)]">
          Not configurable: these exist to make the software work and nobody has
          a reason to keep them. Sign-in counters hold no addresses — the
          identifier is hashed before it is written.
        </p>
      </div>

      <div className="border-t border-[var(--color-line)] pt-4">
        <FormError message={preview?.error} />
        {preview?.preview ? (
          <p className="mb-3 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-3)] px-3 py-2 text-[13px]">
            {preview.preview}
          </p>
        ) : null}

        <form action={runPreview} className="flex flex-wrap items-center gap-3">
          <SubmitButton size="sm" variant="secondary" pendingText="Counting…">
            What would the next sweep remove?
          </SubmitButton>
          <span className="text-[12.5px] text-[var(--color-muted)]">
            Counts only. Nothing is deleted by asking.
          </span>
        </form>

        <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">
          {lastRun
            ? `Last sweep: ${lastRun}`
            : "The sweep has never run. It goes with the daily cron — see DEPLOY.md."}
        </p>
      </div>
    </div>
  );
}
