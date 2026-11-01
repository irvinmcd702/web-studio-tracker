"use client";

import { useActionState, useState } from "react";

import {
  Field,
  FormError,
  Input,
  Select,
  SubmitButton,
  Textarea,
  type ActionState,
} from "@/components/ui/form";
import { PortalToggles } from "@/components/project/portal-toggles";
import { CrewPicker, type CrewPerson } from "@/components/project/crew-picker";
import { budgetTypeLabels, projectStatusLabels } from "@/lib/labels";
import type { PortalToggleValues } from "@/lib/portal";

export type Option = { id: string; name: string; extra?: string };

export type ProjectFormValues = {
  id?: string;
  name?: string;
  key?: string;
  description?: string | null;
  status?: string;
  clientId?: string | null;
  managerId?: string | null;
  workflowId?: string;
  startDate?: string | null;
  dueDate?: string | null;
  budgetType?: string;
  budgetHours?: number | null;
  hourlyRate?: number | null;
  fixedAmount?: number | null;
  currency?: string;
  memberIds?: string[];
  rocketChatChannel?: string | null;
};

const CURRENCIES = ["USD", "EUR", "GBP"];

export function ProjectForm({
  action,
  values,
  clients,
  managers,
  workflows,
  people,
  requestId,
  templateId,
  submitLabel = "Create project",
  showCrew = true,
  showWorkflow = true,
  portalDefaults,
  showRocketChatChannel = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values?: ProjectFormValues;
  clients: Option[];
  managers: Option[];
  workflows: Option[];
  people: CrewPerson[];
  requestId?: string;
  /** Passed straight back, so the tickets are created from what was chosen. */
  templateId?: string;
  submitLabel?: string;
  showCrew?: boolean;
  /**
   * Creating only. Changing an existing project's workflow moves every ticket
   * on it to a different set of statuses, which is far too much to happen as a
   * side effect of pressing Save on a form about names and dates — so
   * `updateProjectAction` does not read this field at all. Leaving the control
   * on screen anyway meant a dropdown that changed, saved, said "Saved", and
   * did nothing. The switcher below the form is where it really happens.
   */
  showWorkflow?: boolean;
  /** Create mode only: prefills the portal switches from the studio defaults. */
  portalDefaults?: PortalToggleValues;
  /** Shown only while the Rocket.Chat integration is switched on. */
  showRocketChatChannel?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const [budgetType, setBudgetType] = useState(values?.budgetType ?? "HOURLY");

  return (
    <form action={formAction} className="space-y-6">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {templateId ? (
        <input type="hidden" name="templateId" value={templateId} />
      ) : null}
      {requestId ? (
        <input type="hidden" name="requestId" value={requestId} />
      ) : null}

      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Project name" required className="sm:col-span-2">
          <Input
            name="name"
            defaultValue={values?.name}
            placeholder="Acme corporate website"
            required
          />
        </Field>

        <Field
          label="Key"
          hint={
            values?.key ? "The key can't be changed" : "Leave blank to generate"
          }
        >
          <Input
            name="key"
            defaultValue={values?.key}
            placeholder="ACME"
            maxLength={6}
            disabled={Boolean(values?.key)}
            className="font-mono uppercase"
          />
        </Field>
      </div>

      <Field label="Description">
        <Textarea
          name="description"
          rows={4}
          defaultValue={values?.description ?? ""}
          placeholder="Scope of work, key requirements, constraints…"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Client">
          <Select name="clientId" defaultValue={values?.clientId ?? ""}>
            <option value="">— Internal project —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Project manager">
          <Select name="managerId" defaultValue={values?.managerId ?? ""}>
            <option value="">— Unassigned —</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.extra ? ` · ${m.extra}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Status">
          <Select name="status" defaultValue={values?.status ?? "ACTIVE"}>
            {Object.entries(projectStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {showWorkflow ? (
          <Field label="Workflow" hint="Ticket statuses and transitions">
            <Select name="workflowId" defaultValue={values?.workflowId ?? ""}>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.extra ? ` · ${w.extra}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Start date">
          <Input
            type="date"
            name="startDate"
            defaultValue={values?.startDate ?? ""}
          />
        </Field>

        <Field label="Due date">
          <Input
            type="date"
            name="dueDate"
            defaultValue={values?.dueDate ?? ""}
          />
        </Field>
      </div>

      {showRocketChatChannel ? (
        <Field
          label="Rocket.Chat channel"
          hint="Where this project's notifications go. Leave blank for the studio default channel."
        >
          <Input
            name="rocketChatChannel"
            defaultValue={values?.rocketChatChannel ?? ""}
            placeholder="#acme-store"
          />
        </Field>
      ) : null}

      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/60 p-4">
        <p className="mb-3 text-[13px] font-semibold">Budget</p>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["HOURLY", "FIXED"] as const).map((type) => (
            <label
              key={type}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition ${
                budgetType === type
                  ? "border-[var(--color-brand)] bg-[var(--color-surface)] font-medium text-[var(--color-brand)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-2)] hover:border-[var(--color-line-strong)]"
              }`}
            >
              <input
                type="radio"
                name="budgetType"
                value={type}
                checked={budgetType === type}
                onChange={() => setBudgetType(type)}
                className="accent-[var(--color-brand)]"
              />
              {budgetTypeLabels[type]}
            </label>
          ))}
        </div>

        {budgetType === "HOURLY" ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Budget, hours">
              <Input
                name="budgetHours"
                inputMode="decimal"
                defaultValue={values?.budgetHours ?? ""}
                placeholder="120"
              />
            </Field>
            <Field label="Hourly rate">
              <Input
                name="hourlyRate"
                inputMode="decimal"
                defaultValue={values?.hourlyRate ?? ""}
                placeholder="85"
              />
            </Field>
            <Field label="Currency">
              <Select name="currency" defaultValue={values?.currency ?? "USD"}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Contract amount" className="sm:col-span-2">
              <Input
                name="fixedAmount"
                inputMode="decimal"
                defaultValue={values?.fixedAmount ?? ""}
                placeholder="24000"
              />
            </Field>
            <Field label="Currency">
              <Select name="currency" defaultValue={values?.currency ?? "USD"}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </div>

      {showCrew ? (
        <CrewPicker people={people} defaultSelected={values?.memberIds} />
      ) : null}

      {portalDefaults ? (
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)]/60 p-4">
          <input type="hidden" name="portalConfigured" value="1" />
          <p className="text-[13px] font-semibold">Client portal</p>
          <p className="mb-3 text-[12px] text-[var(--color-muted)]">
            Prefilled from the studio defaults — change them here for this
            project, or later in its settings.
          </p>
          <PortalToggles values={portalDefaults} compact />
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-[var(--color-line)] pt-4">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
