"use client";

import { useActionState } from "react";

import { updatePortalSettingsAction } from "@/app/actions/projects";
import { FormError, SubmitButton } from "@/components/ui/form";
import { PortalToggles } from "@/components/project/portal-toggles";
import type { PortalToggleValues } from "@/lib/portal";

export function PortalSettingsForm({
  projectId,
  values,
  hasClient,
}: {
  projectId: string;
  values: PortalToggleValues;
  hasClient: boolean;
}) {
  const [state, action] = useActionState(updatePortalSettingsAction, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={projectId} />

      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      {!hasClient ? (
        <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-[12.5px] text-[var(--color-warn)]">
          This project has no client yet, so nobody can open the portal. The
          settings below are saved anyway.
        </p>
      ) : null}

      <PortalToggles values={values} />

      <div className="border-t border-[var(--color-line)] pt-4">
        <SubmitButton size="sm">Save portal settings</SubmitButton>
      </div>
    </form>
  );
}
