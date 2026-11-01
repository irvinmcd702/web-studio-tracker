"use client";

import { useActionState } from "react";

import { requestPasswordResetAction } from "@/app/actions/password-reset";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordResetAction, null);

  // The same answer for every address, so the form cannot be used to find out
  // who has an account here.
  if (state?.ok) {
    return (
      <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--color-ok)]">
        {(state as { message?: string }).message}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />

      <Field label="Email" required>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@studio.com"
          required
        />
      </Field>

      <SubmitButton className="w-full" pendingText="Sending…">
        Email me a link
      </SubmitButton>
    </form>
  );
}
