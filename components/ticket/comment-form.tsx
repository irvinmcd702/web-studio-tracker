"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { addCommentAction } from "@/app/actions/tickets";
import { FormError, SubmitButton } from "@/components/ui/form";
import {
  MentionTextarea,
  type MentionPerson,
} from "@/components/ui/mention-textarea";

export function CommentForm({
  ticketId,
  people = [],
}: {
  ticketId: string;
  /** Who `@` can reach from here. Empty means the hint is left unsaid. */
  people?: MentionPerson[];
}) {
  const [state, action] = useActionState(addCommentAction, null);
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
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormError message={state?.error} />
      <MentionTextarea
        people={people}
        name="body"
        rows={3}
        required
        aria-label="Comment"
        placeholder={
          people.length
            ? "Add a comment… type @ to bring somebody in"
            : "Add a comment…"
        }
        className="field resize-none"
      />
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingText="Sending…">
          Add comment
        </SubmitButton>
      </div>
    </form>
  );
}
