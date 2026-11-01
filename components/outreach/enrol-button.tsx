"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

import { enrolLeadsAction } from "@/app/actions/campaigns";
import { leadStatusLabels } from "@/lib/labels";
import { Modal, useModalClose } from "@/components/ui/modal";
import { Field, FormError, Input, Select, SubmitButton } from "@/components/ui/form";

export function EnrolButton({ campaignId }: { campaignId: string }) {
  return (
    <Modal
      title="Enrol leads"
      description="They land waiting for approval — nothing is sent until somebody reads the first message"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <UserPlus size={15} />
          Enrol leads
        </span>
      }
    >
      <EnrolForm campaignId={campaignId} />
    </Modal>
  );
}

function EnrolForm({ campaignId }: { campaignId: string }) {
  const [state, action] = useActionState(enrolLeadsAction, null);
  const close = useModalClose();
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      // The refusal counts come back on `error` even when it worked, so the
      // modal stays open long enough to read them.
      if (!state.error) close?.();
    }
  }, [state, close, router]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="campaignId" value={campaignId} />
      <FormError message={state?.error} />

      <Field label="Which leads" hint="Anyone already in this campaign is skipped.">
        <Select name="status" defaultValue="NEW">
          {["NEW", "ACTIVE", "DISQUALIFIED"].map((value) => (
            <option key={value} value={value}>
              {leadStatusLabels[value]}
            </option>
          ))}
          <option value="ANY">Any status</option>
        </Select>
      </Field>

      <Field
        label="How many"
        hint="At most 500 at a time. Suppressed addresses are refused and counted."
      >
        <Input name="limit" type="number" min={1} max={500} defaultValue={25} />
      </Field>

      <SubmitButton size="sm" pendingText="Enrolling…">
        Enrol
      </SubmitButton>
    </form>
  );
}
