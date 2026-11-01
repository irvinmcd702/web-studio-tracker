"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";

import { createWorkflowAction } from "@/app/actions/workflows";
import { Modal } from "@/components/ui/modal";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

const PRESETS = [
  {
    value: "simple",
    label: "Simple",
    hint: "To do → In progress → Done",
  },
  {
    value: "dev",
    label: "Development",
    hint: "Backlog → In development → Code review → QA → Done",
  },
  {
    value: "design",
    label: "Design",
    hint: "Brief → Concept → Design → Client review → Approved",
  },
  { value: "blank", label: "Blank", hint: "Add the statuses yourself" },
];

export function CreateWorkflowButton() {
  return (
    <Modal
      title="New workflow"
      description="A set of statuses and the transitions allowed between them"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={15} />
          New workflow
        </span>
      }
    >
      <WorkflowCreateForm />
    </Modal>
  );
}

function WorkflowCreateForm() {
  const [state, action] = useActionState(createWorkflowAction, null);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />

      <Field label="Name" required>
        <Input name="name" placeholder="Website development" required />
      </Field>

      <Field label="Description">
        <Textarea
          name="description"
          rows={2}
          placeholder="Which kind of projects this fits"
        />
      </Field>

      <div>
        <p className="label">Preset</p>
        <div className="space-y-2">
          {PRESETS.map((preset, index) => (
            <label
              key={preset.value}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--color-line)] px-3 py-2.5 transition hover:border-[var(--color-line-strong)] has-[:checked]:border-[var(--color-brand)] has-[:checked]:bg-[var(--color-brand-soft)]"
            >
              <input
                type="radio"
                name="preset"
                value={preset.value}
                defaultChecked={index === 0}
                className="mt-0.5 accent-[var(--color-brand)]"
              />
              <span>
                <span className="block text-[13.5px] font-medium">
                  {preset.label}
                </span>
                <span className="block text-[12px] text-[var(--color-muted)]">
                  {preset.hint}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton>Create workflow</SubmitButton>
      </div>
    </form>
  );
}
