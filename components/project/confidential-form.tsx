"use client";

import { useActionState } from "react";

import { updateProjectConfidentialAction } from "@/app/actions/projects";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * Closing a project to the managers who are not on it.
 *
 * The wording here matters more than the switch does. Somebody reaches for
 * this because a project is sensitive, and what they need to know before they
 * rely on it is exactly who can still see it — including the part they might
 * not want to hear.
 */
export function ProjectConfidentialForm({
  projectId,
  closed,
  adminNames,
}: {
  projectId: string;
  closed: boolean;
  /** Named, not counted: "two administrators" tells nobody anything. */
  adminNames: string[];
}) {
  const [state, action] = useActionState(updateProjectConfidentialAction, null);

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
          name="isConfidential"
          defaultChecked={closed}
          className="mt-0.5 accent-[var(--color-brand)]"
        />
        <span>
          <span className="block text-[13.5px] font-medium">
            Close this project
          </span>
          <span className="block text-[12.5px] text-[var(--color-muted)]">
            Managers stop seeing it just for being managers. It stays visible to
            the crew, the project manager, anybody holding one of its tickets,
            and anybody on the list below. Closing it puts you on that list.
          </span>
        </span>
      </label>

      <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--color-warn)]">
        {adminNames.length === 1 ? (
          <>
            <span className="font-medium">{adminNames[0]}</span> keeps access as
            administrator.
          </>
        ) : (
          <>
            <span className="font-medium">{adminNames.join(", ")}</span> keep
            access as administrators.
          </>
        )}{" "}
        That is not a gap left open by mistake: they hold the database, the
        backups and everyone&rsquo;s password reset. A switch that claimed
        otherwise would be describing a wall that is not there. If the material
        must not be readable by them either, it does not belong in the tracker.
      </p>

      <p className="text-[12.5px] text-[var(--color-muted)]">
        The client sees no difference — their portal shows whatever its own
        switches allow. This closes the studio&rsquo;s doors, not theirs.
      </p>

      <div className="border-t border-[var(--color-line)] pt-4">
        <SubmitButton size="sm">Save</SubmitButton>
      </div>
    </form>
  );
}
