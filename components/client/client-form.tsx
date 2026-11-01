"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { createClientAction, updateClientAction } from "@/app/actions/clients";
import { Modal, useModalClose } from "@/components/ui/modal";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

export function CreateClientButton() {
  return (
    <Modal
      title="New client"
      description="A customer company that projects are attached to"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={15} />
          New client
        </span>
      }
    >
      <ClientForm mode="create" closeOnSuccess />
    </Modal>
  );
}

export function ClientForm({
  mode,
  values,
  closeOnSuccess = false,
}: {
  mode: "create" | "edit";
  values?: {
    id: string;
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    notes: string | null;
  };
  closeOnSuccess?: boolean;
}) {
  const [state, action] = useActionState(
    mode === "create" ? createClientAction : updateClientAction,
    null,
  );
  const close = useModalClose();
  const router = useRouter();

  useEffect(() => {
    if (state?.ok && closeOnSuccess) {
      router.refresh();
      close();
    }
  }, [state, closeOnSuccess, close, router]);

  return (
    <form action={action} className="space-y-4">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormError message={state?.error} />
      {state?.ok && !closeOnSuccess ? (
        <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <Field label="Company name" required>
        <Input
          name="name"
          defaultValue={values?.name}
          placeholder="Acme Inc."
          required
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name">
          <Input name="contactName" defaultValue={values?.contactName ?? ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={values?.phone ?? ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <Input name="email" type="email" defaultValue={values?.email ?? ""} />
        </Field>
        <Field label="Website">
          <Input name="website" defaultValue={values?.website ?? ""} />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea name="notes" rows={3} defaultValue={values?.notes ?? ""} />
      </Field>

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton>{mode === "create" ? "Create" : "Save"}</SubmitButton>
      </div>
    </form>
  );
}
