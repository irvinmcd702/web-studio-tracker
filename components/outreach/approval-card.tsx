"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  approveFirstTouchAction,
  discardFirstTouchAction,
} from "@/app/actions/campaigns";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";

/**
 * The one decision that lets anything reach a stranger.
 *
 * A person reads this exact text against this named lead and presses Approve.
 * What is scheduled is what was in the box — including any edit made here —
 * rather than the template it started from.
 *
 * Every later message in the sequence is a template this same person wrote and
 * saved, which is why they do not each need approving: nothing new is
 * generated between now and then.
 */
export function ApprovalCard({
  message,
}: {
  message: {
    id: string;
    subject: string;
    body: string;
    lead: {
      name: string | null;
      email: string;
      companyName: string | null;
      sourceDetail: string | null;
    };
  };
}) {
  const [state, action] = useActionState(approveFirstTouchAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <div className="px-5 py-4">
      <div className="mb-3">
        <p className="text-[13.5px] font-medium">
          {message.lead.name ?? message.lead.email}
          {message.lead.companyName ? ` · ${message.lead.companyName}` : ""}
        </p>
        <p className="text-[12px] text-[var(--color-muted)]">
          {message.lead.email}
          {message.lead.sourceDetail ? ` · from: ${message.lead.sourceDetail}` : ""}
        </p>
      </div>

      <form action={action} className="space-y-3">
        <input type="hidden" name="id" value={message.id} />
        <FormError message={state?.error} />

        <Field label="Subject">
          <Input name="subject" defaultValue={message.subject} maxLength={200} />
        </Field>

        <Field
          label="Message"
          hint="Edit it if you want. What goes out is what is in this box, plus the footer."
        >
          <Textarea
            name="body"
            rows={8}
            defaultValue={message.body}
            maxLength={4000}
            className="resize-y"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <SubmitButton size="sm" pendingText="Approving…">
            Approve and schedule
          </SubmitButton>
        </div>
      </form>

      <form action={discardFirstTouchAction} className="mt-2">
        <input type="hidden" name="id" value={message.id} />
        <Button type="submit" variant="ghost" size="sm">
          Discard — do not write to them
        </Button>
      </form>
    </div>
  );
}
