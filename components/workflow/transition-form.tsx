"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { addTransitionAction } from "@/app/actions/workflows";
import {
  Field,
  FormError,
  Input,
  Select,
  SubmitButton,
} from "@/components/ui/form";

export function AddTransitionForm({
  workflowId,
  statuses,
}: {
  workflowId: string;
  statuses: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(addTransitionAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="workflowId" value={workflowId} />
      <FormError message={state?.error} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From status">
          <Select name="fromStatusId" defaultValue="ANY">
            <option value="ANY">Any status</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="To status" required>
          <Select name="toStatusId" defaultValue="" required>
            <option value="" disabled>
              Choose…
            </option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Button label" hint="For example “Send to review”">
        <Input name="name" placeholder="Optional" />
      </Field>

      <SubmitButton size="sm" variant="secondary">
        Add transition
      </SubmitButton>
    </form>
  );
}
