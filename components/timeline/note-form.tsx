"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { addTimelineNoteAction } from "@/app/actions/timeline";
import { FormError, SubmitButton, Textarea } from "@/components/ui/form";

/**
 * Adding a line to the diary.
 *
 * There is no edit control anywhere near this on purpose — see the action.
 */
export function NoteForm({
  clientId,
  requestId,
  leadId,
}: {
  clientId?: string;
  requestId?: string;
  leadId?: string;
}) {
  const [state, action] = useActionState(addTimelineNoteAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="space-y-2">
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      {requestId ? (
        <input type="hidden" name="requestId" value={requestId} />
      ) : null}
      {leadId ? <input type="hidden" name="leadId" value={leadId} /> : null}
      <FormError message={state?.error} />
      <Textarea
        name="summary"
        rows={2}
        required
        aria-label="Note"
        placeholder="What happened — a call, a decision, something they said…"
        className="resize-none"
      />
      <div className="flex items-center justify-between gap-3">
        <p className="hint">Entries cannot be edited afterwards.</p>
        <SubmitButton size="sm" pendingText="Saving…">
          Add note
        </SubmitButton>
      </div>
    </form>
  );
}
