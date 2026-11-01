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

export function RequestForm({
  action,
  clients = [],
  publicMode = false,
  closeOnSuccess = false,
  submitLabel = "Create request",
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  clients?: { id: string; name: string }[];
  publicMode?: boolean;
  closeOnSuccess?: boolean;
  submitLabel?: string;
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

  if (state?.ok && publicMode) {
    return (
      <div className="rounded-lg bg-[var(--color-ok-soft)] px-4 py-6 text-center">
        <p className="text-sm font-medium text-[var(--color-ok)]">
          Request sent
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-ok)]">
          A project manager will get back to you shortly.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormError message={state?.error} />

      <Field label="What do you need built" required>
        <Input
          name="title"
          placeholder="E-commerce store on Next.js"
          required
        />
      </Field>

      <Field label="Describe the project" required>
        <Textarea
          name="description"
          rows={5}
          required
          placeholder="Goals, timeline, references, integrations…"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name">
          <Input name="contactName" placeholder="John Carter" />
        </Field>
        <Field label="Company">
          <Input name="companyName" placeholder="Acme Inc." />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <Input name="contactEmail" type="email" placeholder="john@acme.com" />
        </Field>
        <Field label="Phone">
          <Input name="contactPhone" placeholder="+1 555 123 4567" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ballpark budget">
          <Input name="budgetNote" placeholder="up to $50,000" />
        </Field>

        {publicMode ? null : (
          <Field label="Source">
            <Input name="source" placeholder="Call, email, referral…" />
          </Field>
        )}
      </div>

      {!publicMode && clients.length > 0 ? (
        <Field
          label="Existing client"
          hint="If the inquiry came from a current customer"
        >
          <Select name="clientId" defaultValue="">
            <option value="">— New contact —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton pendingText="Sending…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
