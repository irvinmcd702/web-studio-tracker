"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  Field,
  FormError,
  Input,
  Select,
  SubmitButton,
  Textarea,
  type ActionState,
} from "@/components/ui/form";
import { useModalClose } from "@/components/ui/modal";
import { priorityLabels, ticketTypeLabels } from "@/lib/labels";

export type TicketFormValues = {
  id?: string;
  title?: string;
  description?: string | null;
  acceptance?: string | null;
  type?: string;
  priority?: string;
  statusId?: string;
  estimate?: number | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  isClientVisible?: boolean;
};

export function TicketForm({
  action,
  projectId,
  values,
  assignees,
  statuses,
  submitLabel = "Create ticket",
  closeOnSuccess = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  projectId?: string;
  values?: TicketFormValues;
  assignees: { id: string; name: string; extra?: string }[];
  statuses?: { id: string; name: string }[];
  submitLabel?: string;
  closeOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const close = useModalClose();
  const router = useRouter();

  useEffect(() => {
    if (state?.ok && closeOnSuccess) {
      router.refresh();
      close();
    }
  }, [state, closeOnSuccess, close, router]);

  return (
    <form action={formAction} className="space-y-4">
      {projectId ? (
        <input type="hidden" name="projectId" value={projectId} />
      ) : null}
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <FormError message={state?.error} />

      <Field label="Title" required>
        <Input
          name="title"
          defaultValue={values?.title}
          placeholder="Build the homepage layout"
          required
        />
      </Field>

      <Field label="Description">
        <Textarea
          name="description"
          rows={4}
          defaultValue={values?.description ?? ""}
          placeholder="What needs doing, and what we already know"
        />
      </Field>

      <Field
        label="Done means"
        hint="A checklist, in markdown. This is what an agent is told to satisfy, and a transition can require it."
      >
        <Textarea
          name="acceptance"
          rows={4}
          defaultValue={values?.acceptance ?? ""}
          placeholder={[
            "- [ ] Address survives closing the keyboard on iOS Safari",
            "- [ ] Covered by a test",
            "- [ ] No change to the checkout API",
          ].join("\n")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select name="type" defaultValue={values?.type ?? "TASK"}>
            {Object.entries(ticketTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Priority">
          <Select name="priority" defaultValue={values?.priority ?? "MEDIUM"}>
            {Object.entries(priorityLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Assignee">
          <Select name="assigneeId" defaultValue={values?.assigneeId ?? ""}>
            <option value="">— Unassigned —</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.extra ? ` · ${a.extra}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        {statuses?.length ? (
          <Field label="Status">
            <Select name="statusId" defaultValue={values?.statusId ?? ""}>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Due date">
            <Input
              type="date"
              name="dueDate"
              defaultValue={values?.dueDate ?? ""}
            />
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Estimate, hours">
          <Input
            name="estimate"
            inputMode="decimal"
            defaultValue={values?.estimate ?? ""}
            placeholder="8"
          />
        </Field>

        {statuses?.length ? (
          <Field label="Due date">
            <Input
              type="date"
              name="dueDate"
              defaultValue={values?.dueDate ?? ""}
            />
          </Field>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-[13px]">
        <input
          type="checkbox"
          name="isClientVisible"
          defaultChecked={values?.isClientVisible}
          className="accent-[var(--color-brand)]"
        />
        Show this ticket in the client portal
      </label>

      <div className="flex justify-end gap-2 border-t border-[var(--color-line)] pt-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
