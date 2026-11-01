"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
  type ActionState,
} from "@/components/ui/form";
import { useModalClose } from "@/components/ui/modal";

const COLORS = [
  "#0ea5e9",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#14b8a6",
  "#ef4444",
];

export function TeamForm({
  action,
  values,
  people = [],
  submitLabel = "Create team",
  closeOnSuccess = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: {
    id?: string;
    name?: string;
    description?: string | null;
    color?: string;
  };
  people?: { id: string; name: string; extra?: string }[];
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
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormError message={state?.error} />
      {state?.ok && !closeOnSuccess ? (
        <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <Field label="Name" required>
        <Input
          name="name"
          defaultValue={values?.name}
          placeholder="Frontend"
          required
        />
      </Field>

      <Field label="Description">
        <Textarea
          name="description"
          rows={2}
          defaultValue={values?.description ?? ""}
          placeholder="What this team is responsible for"
        />
      </Field>

      <div>
        <p className="label">Color</p>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((color, index) => (
            <label key={color} className="cursor-pointer">
              <input
                type="radio"
                name="color"
                value={color}
                defaultChecked={
                  values?.color ? values.color === color : index === 0
                }
                className="peer sr-only"
              />
              <span
                className="block h-7 w-7 rounded-full ring-[var(--color-ink)] ring-offset-2 transition peer-checked:ring-2"
                style={{ backgroundColor: color }}
              />
            </label>
          ))}
        </div>
      </div>

      {people.length > 0 ? (
        <div>
          <p className="label">Members</p>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-line)] p-2 scroll-thin">
            {people.map((person) => (
              <label
                key={person.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition hover:bg-[var(--color-hover)]"
              >
                <input
                  type="checkbox"
                  name="memberIds"
                  value={person.id}
                  className="accent-[var(--color-brand)]"
                />
                {person.name}
                {person.extra ? (
                  <span className="text-[var(--color-muted)]">
                    · {person.extra}
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
