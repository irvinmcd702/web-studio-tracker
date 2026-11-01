"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";

import {
  createCampaignAction,
  updateCampaignAction,
} from "@/app/actions/campaigns";
import { Modal } from "@/components/ui/modal";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

export function CreateCampaignButton() {
  return (
    <Modal
      title="New campaign"
      description="A sequence of messages, and the hours it may go out in"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Plus size={15} />
          New campaign
        </span>
      }
      width="max-w-lg"
    >
      <CampaignForm mode="create" />
    </Modal>
  );
}

export type CampaignFormValues = {
  id: string;
  name: string;
  description: string | null;
  windowStartHour: number;
  windowEndHour: number;
  windowDays: string;
  timezone: string;
  dailyCap: number;
  minGapMinutes: number;
  fromName: string | null;
};

const DAYS = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "7", label: "Sun" },
];

export function CampaignForm({
  mode,
  values,
}: {
  mode: "create" | "edit";
  values?: CampaignFormValues;
}) {
  const [state, action] = useActionState(
    mode === "create" ? createCampaignAction : updateCampaignAction,
    null,
  );

  const selected = new Set((values?.windowDays ?? "1,2,3,4,5").split(","));

  return (
    <form action={action} className="space-y-4">
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <Field label="Name" required>
        <Input
          name="name"
          required
          maxLength={120}
          defaultValue={values?.name ?? ""}
          placeholder="Agencies, August"
        />
      </Field>

      <Field label="What this is for" hint="Only the studio sees this.">
        <Textarea
          name="description"
          rows={2}
          maxLength={500}
          defaultValue={values?.description ?? ""}
          className="resize-none"
        />
      </Field>

      <fieldset>
        <legend className="label">Days it may send</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {DAYS.map((day) => (
            <label
              key={day.value}
              className="flex cursor-pointer items-center gap-1.5 text-[13px]"
            >
              <input
                type="checkbox"
                name="windowDays"
                value={day.value}
                defaultChecked={selected.has(day.value)}
                className="accent-[var(--color-brand)]"
              />
              {day.label}
            </label>
          ))}
        </div>
        <p className="hint">No days ticked is a way of pausing it.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="From hour">
          <Input
            name="windowStartHour"
            type="number"
            min={0}
            max={23}
            defaultValue={values?.windowStartHour ?? 9}
          />
        </Field>
        <Field label="Until hour" hint="Exclusive.">
          <Input
            name="windowEndHour"
            type="number"
            min={1}
            max={24}
            defaultValue={values?.windowEndHour ?? 17}
          />
        </Field>
        <Field label="Timezone" hint="An IANA name.">
          <Input
            name="timezone"
            maxLength={60}
            defaultValue={values?.timezone ?? "UTC"}
            placeholder="Europe/Berlin"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="At most, per day" hint="For this campaign alone.">
          <Input
            name="dailyCap"
            type="number"
            min={1}
            max={500}
            defaultValue={values?.dailyCap ?? 30}
          />
        </Field>
        <Field
          label="Minutes between messages"
          hint="The scheduler runs every five, so anything under that is rounded up to five."
        >
          <Input
            name="minGapMinutes"
            type="number"
            min={0}
            max={1440}
            defaultValue={values?.minGapMinutes ?? 6}
          />
        </Field>
      </div>

      <Field
        label="From name for this campaign"
        hint="Optional. The address itself is never per-campaign."
      >
        <Input
          name="fromName"
          maxLength={120}
          defaultValue={values?.fromName ?? ""}
        />
      </Field>

      <SubmitButton size="sm">
        {mode === "create" ? "Create campaign" : "Save"}
      </SubmitButton>
    </form>
  );
}
