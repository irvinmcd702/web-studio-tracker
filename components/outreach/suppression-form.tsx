"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";

import { suppressAddressAction } from "@/app/actions/leads";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";

/** Adding an address the studio was asked to stop writing to, by hand. */
export function SuppressionForm() {
  const [state, action] = useActionState(suppressAddressAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <FormError message={state?.error} />

      <Field
        label="Email address"
        required
        hint="It does not have to be a lead. An address can be suppressed before anybody imports it."
      >
        <Input name="email" type="email" required maxLength={160} />
      </Field>

      <Field label="Why">
        <Input
          name="note"
          maxLength={200}
          placeholder="They asked us on the phone"
        />
      </Field>

      <SubmitButton size="sm" pendingText="Adding…">
        Add to the list
      </SubmitButton>
    </form>
  );
}

/** The same thing for an address already on screen. */
export function SuppressLeadButton({ email }: { email: string }) {
  const [state, action] = useActionState(suppressAddressAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="note" value="Suppressed from the lead page" />
      <FormError message={state?.error} />
      <SubmitButton size="sm" variant="secondary" pendingText="Adding…">
        <Ban size={14} />
        Suppress this address
      </SubmitButton>
    </form>
  );
}
