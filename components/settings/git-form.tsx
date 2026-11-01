"use client";

import { useActionState } from "react";

import { updateGitAction } from "@/app/actions/settings";
import { CopyLink } from "@/components/ui/copy-link";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";

/**
 * Incoming git events. The forge posts here; nothing goes out.
 *
 * The secret is shown once, right after it is generated — the field never
 * echoes it back on a later page load, so a shoulder-surfed settings screen
 * gives nothing away.
 */
export function GitForm({
  values,
  webhookUrl,
}: {
  values: {
    gitEnabled: boolean;
    hasSecret: boolean;
    gitStatusOnOpen: string | null;
    gitStatusOnMerge: string | null;
    gitLastEventAt: string | null;
    gitLastEventInfo: string | null;
  };
  webhookUrl: string;
}) {
  const [state, action] = useActionState(updateGitAction, null);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />

      {state?.ok && state.secret ? (
        <CopyLink
          link={state.secret}
          hint="Secret generated. Paste it into the webhook settings of your repository — it is not shown again."
        />
      ) : state?.ok ? (
        <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name="gitEnabled"
          defaultChecked={values.gitEnabled}
          className="mt-0.5 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-[13.5px] font-medium">
            Accept events from git
          </span>
          <span className="block text-[12.5px] text-[var(--color-muted)]">
            A branch or pull request naming a ticket (ACME-14) comments on it
            with the link.
          </span>
        </span>
      </label>

      <div>
        <p className="label mb-1">Webhook URL</p>
        <code className="block overflow-x-auto rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-3)] px-3 py-2 font-mono text-[12px] scroll-thin">
          {webhookUrl}
        </code>
        <p className="hint">
          GitHub: content type{" "}
          <span className="font-mono">application/json</span>, events{" "}
          <span className="font-mono">push</span> and{" "}
          <span className="font-mono">pull_request</span>. GitLab: push and
          merge request events, secret in the token field.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Move to, when a PR opens"
          hint="Status name. Empty means comment only."
        >
          <Input
            name="gitStatusOnOpen"
            defaultValue={values.gitStatusOnOpen ?? ""}
            placeholder="Code review"
          />
        </Field>

        <Field
          label="Move to, when it merges"
          hint="A project whose workflow lacks the status keeps the comment."
        >
          <Input
            name="gitStatusOnMerge"
            defaultValue={values.gitStatusOnMerge ?? ""}
            placeholder="QA"
          />
        </Field>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name="rotate"
          className="mt-0.5 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-[13.5px] font-medium">
            {values.hasSecret ? "Generate a new secret" : "Generate the secret"}
          </span>
          <span className="block text-[12.5px] text-[var(--color-muted)]">
            {values.hasSecret
              ? "The old one stops working the moment you save."
              : "Needed before the integration can be switched on."}
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton size="sm">Save</SubmitButton>
        {values.gitLastEventAt ? (
          <span className="text-[12px] text-[var(--color-muted)]">
            Last event {values.gitLastEventAt}
            {values.gitLastEventInfo ? ` — ${values.gitLastEventInfo}` : ""}
          </span>
        ) : (
          <span className="text-[12px] text-[var(--color-muted)]">
            No events received yet
          </span>
        )}
      </div>
    </form>
  );
}
