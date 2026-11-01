"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { addWorkLogAction } from "@/app/actions/tickets";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";

export function WorkLogForm({ ticketId }: { ticketId: string }) {
  const [state, action] = useActionState(addWorkLogAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="ticketId" value={ticketId} />
      <FormError message={state?.error} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Hours" required>
          <Input name="hours" inputMode="decimal" placeholder="2.5" required />
        </Field>
        <Field label="Date">
          <Input type="date" name="spentOn" defaultValue={today} />
        </Field>
      </div>

      <Field label="What did you work on">
        <Input name="description" placeholder="Built the features section" />
      </Field>

      <SubmitButton size="sm" className="w-full" pendingText="Saving…">
        Log time
      </SubmitButton>
    </form>
  );
}
