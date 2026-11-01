"use client";

import { useActionState } from "react";

import { updateAgentHoursAction } from "@/app/actions/settings";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * Whether anyone is shown the agent/human split.
 *
 * The source of every logged hour is recorded regardless — that is a fact
 * about the work, not a preference. This decides whether the studio sees the
 * breakdown on the budget page, in the reports and in the CSV. What the client
 * sees is a separate, per-project switch in the portal settings, off by
 * default.
 */
export function AgentHoursForm({ enabled }: { enabled: boolean }) {
  const [state, action] = useActionState(updateAgentHoursAction, null);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name="agentHoursVisible"
          defaultChecked={enabled}
          className="mt-0.5 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-[13.5px] font-medium">
            Show agent hours separately
          </span>
          <span className="block text-[12.5px] text-[var(--color-muted)]">
            Adds the split to the project budget, the reports and the CSV
            export. Switching it off hides the breakdown; it does not stop the
            tracker recording which hours an agent logged.
          </span>
        </span>
      </label>

      <SubmitButton size="sm">Save</SubmitButton>
    </form>
  );
}
