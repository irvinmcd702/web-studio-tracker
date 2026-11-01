"use client";

import { useActionState } from "react";

import { setPasswordAction } from "@/app/actions/auth";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(setPasswordAction, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError message={state?.error} />

      <Field label="New password" required hint="At least 8 characters">
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
        />
      </Field>

      <Field label="Repeat the password" required>
        <Input
          name="confirm"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
        />
      </Field>

      <SubmitButton className="w-full" pendingText="Saving…">
        Save and sign in
      </SubmitButton>
    </form>
  );
}
