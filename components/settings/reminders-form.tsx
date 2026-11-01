"use client";

import { useActionState } from "react";

import {
  sendDigestPreviewAction,
  updateRemindersAction,
} from "@/app/actions/settings";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * The rules behind "Needs attention" and the daily digest.
 *
 * Each rule is a single number and **zero turns it off** — there is no second
 * switch that can disagree with the threshold next to it.
 */

type Values = {
  remindDueWithinDays: number;
  remindStalledDays: number;
  remindApprovalDays: number;
  remindClientReplyHours: number;
  remindTimerHours: number;
  remindBudgetPace: boolean;
  digestChatEnabled: boolean;
  digestEmailEnabled: boolean;
};

const RULES: {
  name: keyof Values;
  label: string;
  unit: string;
  max: number;
  help: string;
}[] = [
  {
    name: "remindDueWithinDays",
    label: "Warn before a deadline",
    unit: "days",
    max: 30,
    help: "Applies to both tickets and project deadlines.",
  },
  {
    name: "remindStalledDays",
    label: "Call work stalled after",
    unit: "days",
    max: 60,
    help: "In progress, untouched, and no time logged since.",
  },
  {
    name: "remindApprovalDays",
    label: "Chase a pending approval after",
    unit: "days",
    max: 60,
    help: "Counted from the moment the client was asked.",
  },
  {
    name: "remindClientReplyHours",
    label: "Flag an unanswered client message after",
    unit: "hours",
    max: 336,
    help: "The client wrote last and nobody from the studio has replied.",
  },
  {
    name: "remindTimerHours",
    label: "Flag a running timer after",
    unit: "hours",
    max: 72,
    help: "A stopwatch nobody stopped becomes hours nobody worked.",
  },
];

export function RemindersForm({
  values,
  mailConfigured,
  chatConfigured,
  lastRun,
}: {
  values: Values;
  mailConfigured: boolean;
  chatConfigured: boolean;
  lastRun: string | null;
}) {
  const [state, action] = useActionState(updateRemindersAction, null);
  const [preview, previewAction] = useActionState(
    sendDigestPreviewAction,
    null,
  );

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
          {RULES.map((rule) => (
            <label key={rule.name} className="block">
              <span className="flex items-center justify-between gap-3">
                <span className="text-[13.5px] font-medium">{rule.label}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <input
                    type="number"
                    name={rule.name}
                    defaultValue={String(values[rule.name])}
                    min={0}
                    max={rule.max}
                    step={1}
                    className="field num w-16 text-right"
                  />
                  <span className="text-[12.5px] text-[var(--color-muted)]">
                    {rule.unit}
                  </span>
                </span>
              </span>
              <span className="mt-0.5 block text-[12.5px] text-[var(--color-muted)]">
                {rule.help}
              </span>
            </label>
          ))}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 border-t border-[var(--color-line)] pt-4">
          <input
            type="checkbox"
            name="remindBudgetPace"
            defaultChecked={values.remindBudgetPace}
            className="mt-0.5 accent-[var(--color-brand)]"
          />
          <span>
            <span className="block text-[13.5px] font-medium">
              Warn when the burn rate beats the deadline
            </span>
            <span className="block text-[12.5px] text-[var(--color-muted)]">
              Hourly projects only, and only while they are still inside the
              budget. Going over has its own alert.
            </span>
          </span>
        </label>

        <p className="border-t border-[var(--color-line)] pt-4 text-[12.5px] text-[var(--color-muted)]">
          Zero switches a rule off. Everything above shows up on the dashboard
          of the person it concerns — their own deadlines, and how their
          projects are doing if they run any.
        </p>

        <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
          <p className="text-[13px] font-semibold">Daily digest</p>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="digestEmailEnabled"
              defaultChecked={values.digestEmailEnabled}
              disabled={!mailConfigured}
              className="mt-0.5 accent-[var(--color-brand)]"
            />
            <span>
              <span className="block text-[13.5px] font-medium">
                Email each person their own list
              </span>
              <span className="block text-[12.5px] text-[var(--color-muted)]">
                {mailConfigured
                  ? "One letter per person, containing only what is addressed to them."
                  : "Needs a mail server — set SMTP_URL on the server first."}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="digestChatEnabled"
              defaultChecked={values.digestChatEnabled}
              disabled={!chatConfigured}
              className="mt-0.5 accent-[var(--color-brand)]"
            />
            <span>
              <span className="block text-[13.5px] font-medium">
                Post a studio summary to Rocket.Chat
              </span>
              <span className="block text-[12.5px] text-[var(--color-muted)]">
                {chatConfigured
                  ? "Project-level items only. A channel is not the place for one person's overdue tickets."
                  : "Turn on the Rocket.Chat integration first."}
              </span>
            </span>
          </label>
        </div>

        <SubmitButton size="sm">Save</SubmitButton>
      </form>

      <div className="border-t border-[var(--color-line)] pt-4">
        <FormError message={preview?.error} />
        {preview?.ok ? (
          <p className="mb-3 rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
            Sent to your address.
          </p>
        ) : null}

        <form action={previewAction} className="flex items-center gap-3">
          <SubmitButton size="sm" variant="secondary">
            Email me a preview
          </SubmitButton>
          <span className="text-[12.5px] text-[var(--color-muted)]">
            Goes to you and nobody else.
          </span>
        </form>

        <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">
          {lastRun
            ? `Last scheduled run: ${lastRun}`
            : "The scheduled run has never fired. It is triggered by cron — see DEPLOY.md."}
        </p>
      </div>
    </div>
  );
}
