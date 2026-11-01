"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { saveCampaignStepAction } from "@/app/actions/campaigns";
import { KNOWN_TOKENS } from "@/lib/outreach-render";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

/**
 * Writing a message in the sequence.
 *
 * The hint under the box is doing real work: what a person types here is what
 * a stranger reads, unchanged, possibly weeks later and with nobody watching.
 * Nothing regenerates it at send time — see the header of
 * `lib/outreach-send.ts`.
 */
export function StepEditor({
  campaignId,
  step,
  position,
}: {
  campaignId: string;
  step?: {
    id: string;
    subject: string;
    body: string;
    delayDays: number;
  };
  position: number;
}) {
  const [state, action] = useActionState(saveCampaignStepAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      if (!step) formRef.current?.reset();
      router.refresh();
    }
  }, [state, step, router]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      {step ? <input type="hidden" name="id" value={step.id} /> : null}
      <FormError message={state?.error} />

      <Field label="Subject" required>
        <Input
          name="subject"
          required
          maxLength={200}
          defaultValue={step?.subject ?? ""}
        />
      </Field>

      <Field
        label="Message"
        required
        hint={`Tokens: ${KNOWN_TOKENS.map((t) => `{{${t}}}`).join(", ")}. The unsubscribe link, the postal address and the line saying where their address came from are added automatically — they are not yours to leave out.`}
      >
        <Textarea
          name="body"
          rows={9}
          required
          maxLength={4000}
          defaultValue={step?.body ?? "{{greeting}}\n\n"}
          className="resize-y"
        />
      </Field>

      <Field
        label={position === 1 ? "Sent when approved" : "Days after the previous one"}
        hint={
          position === 1
            ? "The first message goes as soon as somebody approves it, inside the send window."
            : "Counted from when the previous message actually went out, not from when the lead was enrolled."
        }
      >
        <Input
          name="delayDays"
          type="number"
          min={0}
          max={90}
          disabled={position === 1}
          defaultValue={position === 1 ? 0 : (step?.delayDays ?? 3)}
          className="max-w-[8rem]"
        />
      </Field>

      <SubmitButton size="sm">
        {step ? "Save message" : "Add message"}
      </SubmitButton>
    </form>
  );
}
