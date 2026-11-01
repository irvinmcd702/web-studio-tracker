"use client";

import { useActionState } from "react";

import { updateWorkflowAction } from "@/app/actions/workflows";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

export function WorkflowSettingsForm({
  workflow,
}: {
  workflow: { id: string; name: string; description: string | null };
}) {
  const [state, action] = useActionState(updateWorkflowAction, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={workflow.id} />
      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <Field label="Name" required>
        <Input name="name" defaultValue={workflow.name} required />
      </Field>

      <Field label="Description">
        <Textarea
          name="description"
          rows={3}
          defaultValue={workflow.description ?? ""}
        />
      </Field>

      <SubmitButton size="sm">Save</SubmitButton>
    </form>
  );
}
