"use client";

import { useActionState, useState } from "react";

import {
  sendRocketChatTestAction,
  updateRocketChatAction,
} from "@/app/actions/settings";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";

const EVENTS = [
  {
    name: "notifyRequestCreated",
    label: "New client request",
    hint: "Public intake form or a request added by hand → default channel",
  },
  {
    name: "notifyClientMessage",
    label: "Client wrote in the portal chat",
    hint: "The message most worth reacting to quickly",
  },
  {
    name: "notifyProjectCreated",
    label: "Project created",
    hint: "Including projects converted from a request",
  },
  {
    name: "notifyTicketAssigned",
    label: "Ticket assigned",
    hint: "Fires only when the assignee actually changes",
  },
  {
    name: "notifyTicketStatusChanged",
    label: "Ticket moved between statuses",
    hint: "Noisy on a busy board — off by default",
  },
  {
    name: "notifyBudgetThreshold",
    label: "Budget passed 80% / 100%",
    hint: "Announced once per mark, not on every logged hour",
  },
  {
    name: "notifyApprovalDecision",
    label: "Client approved a stage or asked for changes",
    hint: "The sign-off you don't want to find out about a day later",
  },
] as const;

export type RocketChatValues = {
  rocketChatEnabled: boolean;
  hasWebhookUrl: boolean;
  rocketChatDefaultChannel: string | null;
  notifyRequestCreated: boolean;
  notifyClientMessage: boolean;
  notifyProjectCreated: boolean;
  notifyTicketAssigned: boolean;
  notifyTicketStatusChanged: boolean;
  notifyBudgetThreshold: boolean;
  notifyApprovalDecision: boolean;
  lastSentAt: string | null;
  lastOk: boolean | null;
  lastError: string | null;
};

export function RocketChatForm({ values }: { values: RocketChatValues }) {
  const [state, action] = useActionState(updateRocketChatAction, null);
  const [testState, testAction] = useActionState(
    sendRocketChatTestAction,
    null,
  );
  const [enabled, setEnabled] = useState(values.rocketChatEnabled);

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <FormError message={state?.error} />
        {state?.ok ? (
          <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
            Saved
          </p>
        ) : null}

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--color-line)] px-3 py-2.5 transition hover:border-[var(--color-line-strong)]">
          <input
            type="checkbox"
            name="rocketChatEnabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="mt-0.5 accent-[var(--color-brand)]"
          />
          <span>
            <span className="block text-[13.5px] font-medium">
              Send notifications to Rocket.Chat
            </span>
            <span className="block text-[12px] text-[var(--color-muted)]">
              Outgoing only — the tracker posts, it never reads your chat
            </span>
          </span>
        </label>

        <Field
          label="Incoming webhook URL"
          hint={
            values.hasWebhookUrl
              ? "A URL is stored. Leave blank to keep it, or paste a new one to replace it."
              : "Rocket.Chat → Administration → Integrations → New → Incoming"
          }
        >
          <Input
            name="rocketChatWebhookUrl"
            type="password"
            autoComplete="off"
            placeholder={
              values.hasWebhookUrl
                ? "•••••••••••••••• (stored)"
                : "https://chat.example.com/hooks/AbC.../XyZ..."
            }
          />
        </Field>

        <Field
          label="Default channel"
          hint="Used for client requests and for projects without a channel of their own"
        >
          <Input
            name="rocketChatDefaultChannel"
            defaultValue={values.rocketChatDefaultChannel ?? ""}
            placeholder="#studio-requests"
          />
        </Field>

        <div>
          <p className="label">Events</p>
          <div className="space-y-1">
            {EVENTS.map((event) => (
              <label
                key={event.name}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 transition hover:bg-[var(--color-hover)]"
              >
                <input
                  type="checkbox"
                  name={event.name}
                  defaultChecked={values[event.name]}
                  className="mt-0.5 accent-[var(--color-brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium">
                    {event.label}
                  </span>
                  <span className="block text-[12px] text-[var(--color-muted)]">
                    {event.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--color-line)] pt-4">
          <SubmitButton size="sm">Save integration</SubmitButton>
        </div>
      </form>

      <form
        action={testAction}
        className="space-y-2 border-t border-[var(--color-line)] pt-4"
      >
        <FormError message={testState?.error} />
        {testState?.ok ? (
          <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
            Test message delivered
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton size="sm" variant="secondary" pendingText="Sending…">
            Send test message
          </SubmitButton>

          {values.lastSentAt ? (
            <span className="text-[12px] text-[var(--color-muted)]">
              Last delivery {values.lastSentAt} —{" "}
              {values.lastOk ? (
                <span className="text-[var(--color-ok)]">ok</span>
              ) : (
                <span className="text-[var(--color-danger)]">
                  failed{values.lastError ? `: ${values.lastError}` : ""}
                </span>
              )}
            </span>
          ) : (
            <span className="text-[12px] text-[var(--color-muted)]">
              Nothing sent yet
            </span>
          )}
        </div>
        <p className="text-[12px] text-[var(--color-muted)]">
          The test uses the URL typed above if you filled it in, otherwise the
          stored one.
        </p>
      </form>
    </div>
  );
}
