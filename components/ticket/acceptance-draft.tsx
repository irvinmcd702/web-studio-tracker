"use client";

import { useActionState, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { draftAcceptanceAction, saveAcceptanceAction } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * Draft the "Done means" checklist, then let a person fix it and keep it.
 *
 * Two steps on purpose. The model's answer lands in a textarea that is already
 * editable, and nothing reaches the ticket until somebody presses Save — so
 * what ends up as the acceptance criteria is always something a person read.
 */
export function AcceptanceDraft({
  ticketId,
  hasAcceptance,
}: {
  ticketId: string;
  hasAcceptance: boolean;
}) {
  const [draft, requestDraft] = useActionState(draftAcceptanceAction, null);
  const [saved, save] = useActionState(saveAcceptanceAction, null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (draft?.text) {
      setText(draft.text);
      setOpen(true);
    }
  }, [draft]);

  if (saved?.ok) {
    return (
      <p className="text-[13px] text-[var(--color-ok)]">Saved to the ticket.</p>
    );
  }

  return (
    <div className="space-y-3">
      {!open ? (
        <form
          action={requestDraft}
          className="flex flex-wrap items-center gap-3"
        >
          <input type="hidden" name="ticketId" value={ticketId} />
          <SubmitButton variant="secondary" size="sm" pendingText="Drafting…">
            <Sparkles size={15} />
            {hasAcceptance ? "Draft a replacement" : "Draft with the model"}
          </SubmitButton>
          <span className="text-[12.5px] text-[var(--color-muted)]">
            From the title, the description and the project scope. You edit it
            before it is saved.
          </span>
        </form>
      ) : null}

      <FormError message={draft?.error} />
      <FormError message={saved?.error} />

      {open ? (
        <form action={save} className="space-y-2">
          <input type="hidden" name="ticketId" value={ticketId} />
          <textarea
            name="acceptance"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(16, Math.max(6, text.split("\n").length + 1))}
            className="field font-mono text-[12.5px] leading-relaxed"
            aria-label="Draft acceptance criteria"
          />
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton size="sm" pendingText="Saving…">
              Save to the ticket
            </SubmitButton>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false);
                setText("");
              }}
            >
              Discard
            </Button>
            {draft?.note ? (
              <span className="text-[12px] text-[var(--color-muted)]">
                {draft.note}
              </span>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
