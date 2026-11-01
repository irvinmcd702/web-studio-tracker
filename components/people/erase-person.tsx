"use client";

import { useActionState } from "react";
import { ShieldOff } from "lucide-react";

import { anonymiseUserAction } from "@/app/actions/people";
import { Modal } from "@/components/ui/modal";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * Erasing a person's data on request.
 *
 * The email has to be typed rather than a button clicked: this cannot be
 * undone, and a stray click on the wrong row of a list of colleagues is
 * exactly how it would go wrong. The dialog says what survives before it says
 * anything else, because the usual worry — "will this delete the hours we
 * billed?" — deserves answering before the confirm box, not after.
 */
export function ErasePerson({
  id,
  name,
  email,
}: {
  id: string;
  name: string;
  email: string;
}) {
  const [state, action] = useActionState(anonymiseUserAction, null);

  return (
    <Modal
      title="Erase personal data"
      description={`Everything that names ${name} is removed. The work stays.`}
      trigger={<ShieldOff size={14} />}
      triggerLabel={`Erase the personal data of ${name}`}
      triggerClassName="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
    >
      {state?.ok ? (
        <div className="space-y-3">
          <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
            {state.summary}
          </p>
          <p className="text-[12.5px] text-[var(--color-muted)]">
            Reload the page to see the list without them.
          </p>
        </div>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />

          <div className="space-y-2 text-[13px] leading-relaxed">
            <p>
              <span className="font-medium">Removed:</span> name, email,
              position, forge login, password, every session and every API
              token. The account can never be signed into again.
            </p>
            <p>
              <span className="font-medium">Kept:</span> logged hours, comments,
              chat messages and uploaded files — attributed to an account with
              no name. Deleting them outright would take a client&rsquo;s
              billing history with them.
            </p>
            <p className="text-[var(--color-muted)]">
              Text other people wrote is not touched. If a colleague typed this
              person&rsquo;s name into a comment, it is still in that comment —
              search for it and edit it by hand.
            </p>
          </div>

          <FormError message={state?.error} />

          <label className="block">
            <span className="label">
              Type <span className="font-mono">{email}</span> to confirm
            </span>
            <input
              type="text"
              name="confirmEmail"
              autoComplete="off"
              spellCheck={false}
              className="field font-mono text-[12.5px]"
            />
          </label>

          <SubmitButton variant="danger" size="sm" pendingText="Erasing…">
            Erase permanently
          </SubmitButton>
        </form>
      )}
    </Modal>
  );
}
