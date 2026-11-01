"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { createApiTokenAction } from "@/app/actions/api-tokens";
import { CopyLink } from "@/components/ui/copy-link";
import {
  Field,
  FormError,
  Input,
  Select,
  SubmitButton,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";

/**
 * Issues a token and shows it exactly once. Same contract as the invite links:
 * only a hash is stored, so a database dump can't be replayed into API access.
 */
export function ApiTokenForm() {
  const [state, action] = useActionState(createApiTokenAction, null);
  const router = useRouter();

  if (state?.ok && state.token) {
    return (
      <div className="space-y-3">
        <CopyLink
          link={state.token}
          hint={`“${state.name}” created. Copy it now — it is never shown again.`}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => router.refresh()}
        >
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <Input name="name" placeholder="Claude Code on my laptop" required />
        </Field>

        <Field
          label="Used by"
          hint="Agent tokens mark the hours they log as agent work"
        >
          <Select name="kind" defaultValue="AGENT">
            <option value="AGENT">A coding agent</option>
            <option value="PERSONAL">Me, from a script</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Expires in (days)" hint="Leave empty for no expiry">
          <Input
            name="expiresInDays"
            type="number"
            min={1}
            max={365}
            placeholder="90"
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-field)] border border-[var(--color-line)] px-3 py-2.5">
          <input
            type="checkbox"
            name="write"
            className="mt-0.5 accent-[var(--color-brand)]"
          />
          <span>
            <span className="block text-[13px] font-medium">Allow changes</span>
            <span className="block text-[12px] text-[var(--color-muted)]">
              Move tickets, comment, log time. Without this the token can only
              read.
            </span>
          </span>
        </label>
      </div>

      <SubmitButton size="sm" pendingText="Creating…">
        Create token
      </SubmitButton>
    </form>
  );
}
