"use client";

import Link from "next/link";

import { useActionState } from "react";

import { loginAction } from "@/app/actions/auth";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, null);

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

      <Field label="Password" required>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>

      <SubmitButton className="w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>

      <p className="text-center text-[12.5px] text-[var(--color-muted)]">
        <Link
          href="/forgot-password"
          className="font-medium text-[var(--color-brand)] hover:underline"
        >
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
