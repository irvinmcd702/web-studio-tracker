"use client";

import { useActionState } from "react";

import { updateProjectAiAction } from "@/app/actions/projects";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * This project's half of the decision — the one the studio can point at when
 * a client asks whether their material was sent anywhere.
 */
export function ProjectAiForm({
  projectId,
  allowed,
  studioEnabled,
  clientName,
}: {
  projectId: string;
  allowed: boolean;
  studioEnabled: boolean;
  clientName: string | null;
}) {
  const [state, action] = useActionState(updateProjectAiAction, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={projectId} />

      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          name="aiAllowed"
          defaultChecked={allowed}
          className="mt-0.5 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-[13.5px] font-medium">
            Let this project&rsquo;s material be sent for drafting
          </span>
          <span className="block text-[12.5px] text-[var(--color-muted)]">
            Ticket text, the project scope and the client thread — including
            internal notes — go to the model provider when somebody asks for a
            draft. Nothing is sent otherwise, and nothing is ever written back
            without a person saving it.
          </span>
        </span>
      </label>

      {!studioEnabled ? (
        <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-[12.5px] text-[var(--color-warn)]">
          Drafting is switched off for the whole studio, so this setting has no
          effect yet. It is saved either way.
        </p>
      ) : null}

      {clientName ? (
        <p className="text-[12.5px] text-[var(--color-muted)]">
          The material belongs to {clientName}. If your agreement with them says
          where their data may go, this is the switch that has to match it.
        </p>
      ) : null}

      <div className="border-t border-[var(--color-line)] pt-4">
        <SubmitButton size="sm">Save</SubmitButton>
      </div>
    </form>
  );
}
