"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { addTimesheetEntryAction } from "@/app/actions/timesheet";
import {
  Field,
  FormError,
  Input,
  Select,
  SubmitButton,
} from "@/components/ui/form";

export type TicketOption = {
  id: string;
  label: string;
  projectName: string;
};

export function AddEntryForm({
  tickets,
  days,
  defaultDay,
}: {
  tickets: TicketOption[];
  days: { key: string; label: string }[];
  defaultDay: string;
}) {
  const [state, action] = useActionState(addTimesheetEntryAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  // Group the picker by project so long lists stay navigable.
  const grouped = tickets.reduce<Record<string, TicketOption[]>>((acc, t) => {
    (acc[t.projectName] ??= []).push(t);
    return acc;
  }, {});

  if (tickets.length === 0) {
    return (
      <p className="text-[13px] text-[var(--color-muted)]">
        No tickets available yet — get assigned to one, or log time from the
        ticket page.
      </p>
    );
  }

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <FormError message={state?.error} />

      <Field label="Ticket" required>
        <Select name="ticketId" defaultValue="" required>
          <option value="" disabled>
            Choose a ticket…
          </option>
          {Object.entries(grouped).map(([project, items]) => (
            <optgroup key={project} label={project}>
              {items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Day" required>
          <Select name="day" defaultValue={defaultDay}>
            {days.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hours" required>
          <Input name="hours" inputMode="decimal" placeholder="2.5" required />
        </Field>
      </div>

      <Field label="Note">
        <Input name="description" placeholder="What you worked on" />
      </Field>

      <SubmitButton size="sm" className="w-full">
        <Plus size={14} />
        Add entry
      </SubmitButton>
    </form>
  );
}
