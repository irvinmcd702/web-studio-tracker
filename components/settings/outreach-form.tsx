"use client";

import { useActionState } from "react";

import {
  sendOutreachTestAction,
  updateOutreachAction,
} from "@/app/actions/settings";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

/**
 * Outreach: the master switch, and what sending needs to know.
 *
 * Off on the day the software is installed, because holding a list of people
 * who have never heard of the studio is a decision somebody makes rather than
 * one they inherit from a default.
 *
 * The postal address is marked required and refused when empty, rather than
 * accepted and failing later. Finding out from a cancelled message that a
 * commercial email needs one is worse than finding out here.
 */
export function OutreachForm({
  values,
  leads,
  suppressed,
  mailConfigured,
  blocker,
  lastTick,
  inboundUrl,
  hasInboundSecret,
  lastInbound,
}: {
  values: {
    outreachEnabled: boolean;
    outreachFromName: string | null;
    outreachReplyDomain: string | null;
    outreachPostalAddress: string | null;
    outreachSignature: string | null;
    outreachDailyCap: number;
  };
  leads: number;
  suppressed: number;
  mailConfigured: boolean;
  /** Why nothing would send right now, if anything. */
  blocker: string | null;
  lastTick: string | null;
  inboundUrl: string;
  hasInboundSecret: boolean;
  lastInbound: string | null;
}) {
  const [state, action] = useActionState(updateOutreachAction, null);
  const [test, testAction] = useActionState(sendOutreachTestAction, null);

  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4">
        <FormError message={state?.error} />
        {state?.ok ? (
          <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
            Saved
          </p>
        ) : null}

        {!mailConfigured ? (
          <p className="rounded-[var(--radius-field)] bg-[var(--color-warn-soft)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--color-warn)]">
            No <code className="font-mono">OUTREACH_SMTP_URL</code> (or{" "}
            <code className="font-mono">OUTREACH_SMTP_HOST</code>) and{" "}
            <code className="font-mono">OUTREACH_MAIL_FROM</code> on this
            server. Outreach deliberately never falls back to the transactional
            transport — the point of a second channel is that a complaint about
            cold mail cannot stop invites and password resets.
          </p>
        ) : null}

        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            name="outreachEnabled"
            defaultChecked={values.outreachEnabled}
            className="mt-0.5 accent-[var(--color-brand)]"
          />
          <span>
            <span className="block text-[13.5px] font-medium">
              Keep a lead base and send campaigns
            </span>
            <span className="block text-[12.5px] leading-relaxed text-[var(--color-muted)]">
              A list of people the studio has not spoken to yet, with a record
              of where each address came from, a suppression list, and
              sequences of messages a person approves before the first one goes.
            </span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="From name"
            hint="The name on the envelope. The address itself is OUTREACH_MAIL_FROM."
          >
            <Input
              name="outreachFromName"
              maxLength={120}
              defaultValue={values.outreachFromName ?? ""}
              placeholder="Dana at Northwind"
            />
          </Field>

          <Field
            label="Reply domain"
            hint="Replies come back as outreach+token@this. Route the whole subdomain to your provider."
          >
            <Input
              name="outreachReplyDomain"
              maxLength={120}
              defaultValue={values.outreachReplyDomain ?? ""}
              placeholder="hi.studio.example"
            />
          </Field>
        </div>

        <Field
          label="Postal address"
          required
          hint="Printed at the foot of every message. A commercial email without one is not something this tracker will send."
        >
          <Input
            name="outreachPostalAddress"
            maxLength={200}
            defaultValue={values.outreachPostalAddress ?? ""}
            placeholder="Northwind Studio, 14 Bridge Street, Bristol BS1 4TT"
          />
        </Field>

        <Field label="Signature" hint="Available to templates as {{signature}}.">
          <Textarea
            name="outreachSignature"
            rows={2}
            maxLength={300}
            defaultValue={values.outreachSignature ?? ""}
            className="resize-none"
          />
        </Field>

        <Field
          label="Daily ceiling for the whole studio"
          hint="Across every campaign. Each campaign has its own cap underneath this one, and adding campaigns cannot exceed it."
        >
          <Input
            name="outreachDailyCap"
            type="number"
            min={1}
            max={2000}
            defaultValue={values.outreachDailyCap}
            className="max-w-[10rem]"
          />
        </Field>

        <fieldset className="rounded-[var(--radius-field)] border border-[var(--color-line)] px-3.5 py-3">
          <legend className="px-1 text-[12.5px] font-medium">
            Replies coming back
          </legend>

          <p className="text-[12.5px] leading-relaxed text-[var(--color-muted)]">
            Point your mail provider&rsquo;s inbound, bounce and complaint
            webhooks at this address. Mailgun and Resend sign their payloads;
            Postmark does not, so for Postmark append{" "}
            <code className="font-mono">?secret=…</code> and treat that URL as
            the credential it is.
          </p>
          <p className="mt-1.5 break-all font-mono text-[11.5px] text-[var(--color-ink-2)]">
            {inboundUrl}
          </p>

          <label className="mt-3 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="rotateInbound"
              className="mt-0.5 accent-[var(--color-brand)]"
            />
            <span className="text-[12.5px] leading-relaxed">
              {hasInboundSecret
                ? "Generate a new inbound secret. The old one stops working at once, so change it at the provider in the same sitting."
                : "A secret is generated when you save. Until then the inbound endpoint answers 404."}
            </span>
          </label>

          {lastInbound ? (
            <p className="mt-2 text-[12px] text-[var(--color-muted)]">
              Last received: {lastInbound}
            </p>
          ) : null}
        </fieldset>

        <SubmitButton size="sm">Save</SubmitButton>
      </form>

      {values.outreachEnabled ? (
        <div className="space-y-3 border-t border-[var(--color-line)] pt-4">
          {blocker ? (
            <p className="rounded-[var(--radius-field)] bg-[var(--color-warn-soft)] px-3 py-2 text-[12.5px] text-[var(--color-warn)]">
              Nothing will send: {blocker.toLowerCase()}.
            </p>
          ) : (
            <p className="text-[12.5px] text-[var(--color-muted)]">
              {leads} {leads === 1 ? "lead" : "leads"}, {suppressed} suppressed.
              The scheduler runs every five minutes.
            </p>
          )}

          {lastTick ? (
            <p className="text-[12.5px] text-[var(--color-muted)]">
              Last run: {lastTick}
            </p>
          ) : null}

          <form action={testAction}>
            <FormError message={test?.error} />
            {test?.ok ? (
              <p className="mb-2 text-[12.5px] text-[var(--color-ok)]">
                Sent through the outreach transport. Nothing went to anybody
                else.
              </p>
            ) : null}
            <SubmitButton size="sm" variant="secondary" pendingText="Sending…">
              Send a test to yourself
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <p className="rounded-[var(--radius-field)] bg-[var(--color-surface-3)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
        Whether a given list may lawfully be written to is a judgement this
        tracker cannot make for you. It records where every address came from,
        puts that sentence at the foot of every message, and never removes a
        suppression — so the judgement has facts under it.
      </p>
    </div>
  );
}
