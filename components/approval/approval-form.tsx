"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import {
  createApprovalAction,
  updateApprovalAction,
} from "@/app/actions/approvals";
import { Modal, useModalClose } from "@/components/ui/modal";
import { buttonClass } from "@/components/ui/button";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

export type ApprovalFormValues = {
  id?: string;
  title?: string;
  description?: string | null;
  amount?: number | null;
  dueDate?: string | null;
};

export function CreateApprovalButton({
  projectId,
  currency,
}: {
  projectId: string;
  currency: string;
}) {
  return (
    <Modal
      title="New stage"
      description="A deliverable the client signs off on"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={15} />
          New stage
        </span>
      }
      width="max-w-lg"
    >
      <ApprovalForm projectId={projectId} currency={currency} allowSendNow />
    </Modal>
  );
}

export function EditApprovalButton({
  values,
  currency,
}: {
  values: ApprovalFormValues;
  currency: string;
}) {
  return (
    <Modal
      title="Edit stage"
      triggerClassName={buttonClass("ghost", "sm")}
      triggerLabel={values.title ? `Edit the stage ${values.title}` : "Edit this stage"}
      trigger={<Pencil size={14} />}
      width="max-w-lg"
    >
      <ApprovalForm values={values} currency={currency} />
    </Modal>
  );
}

function ApprovalForm({
  projectId,
  values,
  currency,
  allowSendNow = false,
}: {
  projectId?: string;
  values?: ApprovalFormValues;
  currency: string;
  allowSendNow?: boolean;
}) {
  const [state, action] = useActionState(
    values?.id ? updateApprovalAction : createApprovalAction,
    null,
  );
  const close = useModalClose();
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      close();
    }
  }, [state, close, router]);

  return (
    <form action={action} className="space-y-4">
      {projectId ? (
        <input type="hidden" name="projectId" value={projectId} />
      ) : null}
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <FormError message={state?.error} />

      <Field label="Stage" required>
        <Input
          name="title"
          defaultValue={values?.title}
          placeholder="Homepage design"
          required
        />
      </Field>

      <Field label="What exactly is being accepted">
        <Textarea
          name="description"
          rows={4}
          defaultValue={values?.description ?? ""}
          placeholder="Scope of the stage and what approval means"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Stage value, ${currency}`}
          hint="Optional, for staged billing"
        >
          <Input
            name="amount"
            inputMode="decimal"
            defaultValue={values?.amount ?? ""}
            placeholder="6000"
          />
        </Field>
        <Field label="Respond by">
          <Input
            type="date"
            name="dueDate"
            defaultValue={values?.dueDate ?? ""}
          />
        </Field>
      </div>

      {allowSendNow ? (
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            name="sendNow"
            className="accent-[var(--color-brand)]"
          />
          Send to the client right away
        </label>
      ) : null}

      <div className="flex justify-end border-t border-[var(--color-line)] pt-4">
        <SubmitButton>{values?.id ? "Save" : "Create stage"}</SubmitButton>
      </div>
    </form>
  );
}
