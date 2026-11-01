"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { createLeadAction, updateLeadAction } from "@/app/actions/leads";
import { Modal, useModalClose } from "@/components/ui/modal";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

export function CreateLeadButton() {
  return (
    <Modal
      title="New lead"
      description="Somebody the studio has not spoken to yet"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={15} />
          New lead
        </span>
      }
      width="max-w-lg"
    >
      <LeadForm mode="create" closeOnSuccess />
    </Modal>
  );
}

export type LeadFormValues = {
  id: string;
  email: string;
  name: string | null;
  companyName: string | null;
  title: string | null;
  website: string | null;
  phone: string | null;
  country: string | null;
  sourceDetail: string | null;
  consentNote: string | null;
};

/**
 * The two provenance fields sit above the contact details rather than below
 * them, and the first is required.
 *
 * That ordering is the point. Everywhere else in this app the name comes
 * first; here the question "where did this address come from" is asked before
 * anything else, because a row with no answer to it is a row the studio cannot
 * defend, and because the first message ever sent to this person has to repeat
 * that answer back to them.
 */
export function LeadForm({
  mode,
  values,
  closeOnSuccess = false,
}: {
  mode: "create" | "edit";
  values?: LeadFormValues;
  closeOnSuccess?: boolean;
}) {
  const [state, action] = useActionState(
    mode === "create" ? createLeadAction : updateLeadAction,
    null,
  );
  const close = useModalClose();
  const router = useRouter();

  useEffect(() => {
    if (state?.ok && closeOnSuccess) {
      router.refresh();
      close?.();
    }
  }, [state, closeOnSuccess, close, router]);

  return (
    <form action={action} className="space-y-4">
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormError message={state?.error} />
      {state?.ok && !closeOnSuccess ? (
        <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <Field
        label="Where did this address come from"
        required
        hint="In your own words: the conference, the directory, the person who passed it on. This is what the first message has to tell them."
      >
        <Textarea
          name="sourceDetail"
          rows={2}
          required
          maxLength={300}
          defaultValue={values?.sourceDetail ?? ""}
          className="resize-none"
        />
      </Field>

      <Field
        label="Why the studio believes it may write to them"
        hint="Optional, and the tracker cannot answer it for you. Whatever you put here is what a complaint would be answered with."
      >
        <Input
          name="consentNote"
          maxLength={300}
          defaultValue={values?.consentNote ?? ""}
        />
      </Field>

      <Field label="Email" required>
        <Input
          name="email"
          type="email"
          required
          maxLength={160}
          defaultValue={values?.email ?? ""}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input name="name" maxLength={120} defaultValue={values?.name ?? ""} />
        </Field>
        <Field label="Job title">
          <Input
            name="title"
            maxLength={120}
            defaultValue={values?.title ?? ""}
          />
        </Field>
        <Field label="Company">
          <Input
            name="companyName"
            maxLength={160}
            defaultValue={values?.companyName ?? ""}
          />
        </Field>
        <Field label="Website">
          <Input
            name="website"
            maxLength={200}
            defaultValue={values?.website ?? ""}
          />
        </Field>
        <Field label="Phone">
          <Input
            name="phone"
            maxLength={40}
            defaultValue={values?.phone ?? ""}
          />
        </Field>
        <Field label="Country">
          <Input
            name="country"
            maxLength={80}
            defaultValue={values?.country ?? ""}
          />
        </Field>
      </div>

      <SubmitButton size="sm">
        {mode === "create" ? "Add lead" : "Save"}
      </SubmitButton>
    </form>
  );
}
