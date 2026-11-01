"use client";

import { useActionState } from "react";

import { updateAiAction } from "@/app/actions/settings";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * The studio's half of the decision.
 *
 * This says the studio is willing and which model to use. It does not, by
 * itself, send anything: each project still answers for its own material, and
 * the switch below only sets what a newly created project starts with.
 */
export function AiForm({
  values,
  configured,
  outreachEnabled,
  spend,
  lastUsed,
  lastError,
}: {
  values: {
    aiEnabled: boolean;
    aiModel: string;
    aiDefaultAllowed: boolean;
    outreachAiAllowed: boolean;
  };
  /** Only then is the outreach switch worth offering at all. */
  outreachEnabled: boolean;
  configured: boolean;
  spend: {
    calls: number;
    failures: number;
    promptTokens: number;
    completionTokens: number;
    costUsd: number | null;
  };
  lastUsed: string | null;
  lastError: string | null;
}) {
  const [state, action] = useActionState(updateAiAction, null);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      {!configured ? (
        <p className="rounded-[var(--radius-field)] bg-[var(--color-warn-soft)] px-3 py-2 text-[12.5px] text-[var(--color-warn)]">
          No <code className="font-mono">OPENROUTER_API_KEY</code> on this
          server. The key belongs with the database URL and the mail password,
          not in this screen.
        </p>
      ) : null}

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name="aiEnabled"
          defaultChecked={values.aiEnabled}
          disabled={!configured}
          className="mt-0.5 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-[13.5px] font-medium">
            Allow drafting with a model
          </span>
          <span className="block text-[12.5px] text-[var(--color-muted)]">
            Acceptance criteria, a catch-up on a client thread, and a first cut
            at an incoming enquiry. Every one of them produces a draft that a
            person reads and decides on — nothing is written, sent or decided
            for you.
          </span>
        </span>
      </label>

      <label className="block">
        <span className="label">Model</span>
        <input
          type="text"
          name="aiModel"
          defaultValue={values.aiModel}
          placeholder="anthropic/claude-sonnet-5"
          spellCheck={false}
          className="field font-mono text-[12.5px]"
        />
        <span className="hint">Any slug from openrouter.ai/models.</span>
      </label>

      <div className="border-t border-[var(--color-line)] pt-4">
        <label className="flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            name="aiDefaultAllowed"
            defaultChecked={values.aiDefaultAllowed}
            className="mt-0.5 accent-[var(--color-brand)]"
          />
          <span>
            <span className="block text-[13.5px] font-medium">
              New projects allow it from the start
            </span>
            <span className="block text-[12.5px] text-[var(--color-muted)]">
              Off by default. Each project has its own switch either way, and
              changing this never touches a project that already exists.
            </span>
          </span>
        </label>

        {outreachEnabled ? (
          <>
            {/* So the action can tell "unticked" from "never shown". */}
            <input type="hidden" name="outreachAiOffered" value="1" />
            <label className="mt-4 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="outreachAiAllowed"
              defaultChecked={values.outreachAiAllowed}
              className="mt-0.5 accent-[var(--color-brand)]"
            />
            <span>
              <span className="block text-[13.5px] font-medium">
                Outreach may use it too
              </span>
              <span className="block text-[12.5px] leading-relaxed text-[var(--color-muted)]">
                A separate answer from the one above, on purpose. That switch
                is about your own customers&rsquo; material; this one is about
                sending a stranger&rsquo;s letter to the provider — somebody who
                never asked to be contacted and cannot be asked. With it off,
                the outreach drafting buttons do not exist while every other
                one still does.
                </span>
              </span>
            </label>
          </>
        ) : null}
      </div>

      <p className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-3)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
        <span className="font-medium text-[var(--color-ink)]">
          What leaves the building.
        </span>{" "}
        Drafting sends the material it is drafting from — the ticket text and
        the project scope, the message thread including internal notes, or the
        enquiry as it arrived — to OpenRouter and on to the model you named
        above. Hours, money, rates and contact details are never part of it.
        Turning a project&rsquo;s switch off stops it for that client; turning
        this page&rsquo;s first switch off stops all of it at once.
      </p>

      <SubmitButton size="sm">Save</SubmitButton>

      <dl className="grid gap-2 border-t border-[var(--color-line)] pt-4 text-[12.5px] sm:grid-cols-2">
        <div>
          <dt className="text-[var(--color-muted)]">Last 30 days</dt>
          <dd className="num mt-0.5 font-medium">
            {spend.calls} {spend.calls === 1 ? "draft" : "drafts"}
            {spend.failures ? ` · ${spend.failures} failed` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Tokens · cost</dt>
          <dd className="num mt-0.5 font-medium">
            {(spend.promptTokens + spend.completionTokens).toLocaleString(
              "en-US",
            )}
            {spend.costUsd != null
              ? ` · $${spend.costUsd.toFixed(2)}`
              : " · cost not reported"}
          </dd>
        </div>
      </dl>

      {lastUsed ? (
        <p className="text-[12.5px] text-[var(--color-muted)]">
          Last call {lastUsed}
          {lastError ? (
            <span className="text-[var(--color-danger)]"> — {lastError}</span>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
