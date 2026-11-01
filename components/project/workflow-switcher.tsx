"use client";

import { useActionState } from "react";

import { changeProjectWorkflowAction } from "@/app/actions/projects";
import { FormError, Select, SubmitButton } from "@/components/ui/form";

export function WorkflowSwitcher({
  projectId,
  currentWorkflowId,
  workflows,
}: {
  projectId: string;
  currentWorkflowId: string;
  workflows: { id: string; name: string; statusCount: number }[];
}) {
  const [state, action] = useActionState(changeProjectWorkflowAction, null);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={projectId} />
      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Workflow updated — tickets were mapped to matching statuses
        </p>
      ) : null}

      <Select
        name="workflowId"
        aria-label="Workflow for this project"
        defaultValue={currentWorkflowId}
      >
        {workflows.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} · {w.statusCount} statuses
          </option>
        ))}
      </Select>

      <p className="text-[12px] text-[var(--color-muted)]">
        Existing tickets move to a status with the same name, otherwise to the
        first status in the same category.
      </p>

      <SubmitButton size="sm" variant="secondary">
        Switch workflow
      </SubmitButton>
    </form>
  );
}
