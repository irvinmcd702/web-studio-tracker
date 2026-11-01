"use client";

import { useActionState } from "react";

import { updateRequestAction } from "@/app/actions/requests";
import { Field, FormError, Select, SubmitButton } from "@/components/ui/form";
import { requestStatusLabels } from "@/lib/labels";

export function RequestStatusForm({
  requestId,
  status,
  ownerId,
  clientId,
  owners,
  clients,
  locked,
}: {
  requestId: string;
  status: string;
  ownerId: string | null;
  clientId: string | null;
  owners: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  locked: boolean;
}) {
  const [state, action] = useActionState(updateRequestAction, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={requestId} />
      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <Field label="Status">
        <Select name="status" defaultValue={status} disabled={locked}>
          {Object.entries(requestStatusLabels)
            .filter(([value]) => value !== "CONVERTED" || locked)
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </Select>
      </Field>

      <Field label="Owner">
        <Select name="ownerId" defaultValue={ownerId ?? ""}>
          <option value="">— Unassigned —</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Client">
        <Select name="clientId" defaultValue={clientId ?? ""}>
          <option value="">— Not linked —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>

      <SubmitButton size="sm" className="w-full">
        Save
      </SubmitButton>
    </form>
  );
}
