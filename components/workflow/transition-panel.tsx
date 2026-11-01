"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";

import {
  deleteTransitionAction,
  updateTransitionRulesAction,
} from "@/app/actions/workflows";
import { Button } from "@/components/ui/button";
import {
  Field,
  FormError,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";
import { priorityLabels, roleLabels } from "@/lib/labels";
import type {
  TransitionConditions,
  TransitionHooks,
} from "@/lib/workflow-rules";

export type PanelTransition = {
  id: string;
  workflowId: string;
  name: string;
  fromLabel: string;
  toLabel: string;
  conditions: TransitionConditions;
  hooks: TransitionHooks;
  /** Every status in this workflow, for the "only after" condition. */
  statuses: { id: string; name: string }[];
};

const STAFF_ROLES = ["ADMIN", "MANAGER", "MEMBER"] as const;

const CONDITION_FIELDS = [
  { name: "assigneeOnly", label: "Only the assignee may move it" },
  { name: "requireAssignee", label: "Ticket must have an assignee" },
  { name: "requireEstimate", label: "Ticket must have an estimate" },
  { name: "requireDescription", label: "Description must be filled in" },
  { name: "requireAcceptance", label: "Acceptance criteria must be written" },
  { name: "requireComment", label: "At least one comment must exist" },
] as const;

export function TransitionPanel({
  transition,
  onClose,
}: {
  transition: PanelTransition;
  onClose: () => void;
}) {
  const [state, action] = useActionState(updateTransitionRulesAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const { conditions: c, hooks: h } = transition;

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Transition</p>
          <p className="truncate text-[12px] text-[var(--color-muted)]">
            {transition.fromLabel} → {transition.toLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)]"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>

      <form
        action={action}
        className="flex-1 space-y-5 overflow-y-auto px-4 py-4 scroll-thin"
        // Remount on selection change so defaults follow the chosen arrow.
        key={transition.id}
      >
        <input type="hidden" name="id" value={transition.id} />

        <FormError message={state?.error} />
        {state?.ok ? (
          <p className="rounded-lg bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
            Saved
          </p>
        ) : null}

        <Field label="Button label" hint="What the person sees on the ticket">
          <Input name="name" defaultValue={transition.name} required />
        </Field>

        <section className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Conditions
          </p>
          <p className="text-[12px] text-[var(--color-muted)]">
            All of them must hold, or the move is refused.
          </p>

          <div className="rounded-lg border border-[var(--color-line)] p-2">
            <p className="mb-1 px-1 text-[12.5px] font-medium">Allowed roles</p>
            <p className="mb-1.5 px-1 text-[11.5px] text-[var(--color-muted)]">
              None checked means anyone on the project.
            </p>
            {STAFF_ROLES.map((role) => (
              <label
                key={role}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] transition hover:bg-[var(--color-hover)]"
              >
                <input
                  type="checkbox"
                  name="roles"
                  value={role}
                  defaultChecked={c.roles.includes(role)}
                  className="accent-[var(--color-brand)]"
                />
                {roleLabels[role]}
              </label>
            ))}
          </div>

          {CONDITION_FIELDS.map((field) => (
            <label
              key={field.name}
              className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1.5 text-[13px] transition hover:bg-[var(--color-hover)]"
            >
              <input
                type="checkbox"
                name={field.name}
                defaultChecked={c[field.name]}
                className="mt-0.5 accent-[var(--color-brand)]"
              />
              {field.label}
            </label>
          ))}

          {/* The one condition about the past rather than the present, and the
              one that makes an optional shortcut possible. */}
          <label className="mt-1 block rounded-md px-1 py-1.5">
            <span className="mb-1 block text-[13px]">
              Only once the ticket has been in
            </span>
            <select
              name="requireVisitedStatusId"
              defaultValue={c.requireVisitedStatusId ?? ""}
              className="field text-[13px]"
            >
              <option value="">No such requirement</option>
              {transition.statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
            <span className="hint">
              For a shortcut that skips a step: an arrow straight past QA, open
              only to a ticket that has already been through QA. History is
              recorded from the moment this feature was deployed, so tickets
              moved before then look as though they have been nowhere.
            </span>
          </label>
        </section>

        <section className="space-y-2 border-t border-[var(--color-line)] pt-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Hooks
          </p>
          <p className="text-[12px] text-[var(--color-muted)]">
            Run after the move goes through.
          </p>

          <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-[13px] transition hover:bg-[var(--color-hover)]">
            <input
              type="checkbox"
              name="assignToActor"
              defaultChecked={h.assignToActor}
              className="accent-[var(--color-brand)]"
            />
            Assign to whoever moved it
          </label>

          <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-[13px] transition hover:bg-[var(--color-hover)]">
            <input
              type="checkbox"
              name="clearAssignee"
              defaultChecked={h.clearAssignee}
              className="accent-[var(--color-brand)]"
            />
            Clear the assignee
          </label>

          <Field label="Set priority">
            <Select name="setPriority" defaultValue={h.setPriority ?? ""}>
              <option value="">— leave as is —</option>
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Client visibility">
            <Select
              name="setClientVisible"
              defaultValue={
                h.setClientVisible === null
                  ? ""
                  : h.setClientVisible
                    ? "show"
                    : "hide"
              }
            >
              <option value="">— leave as is —</option>
              <option value="show">Show in the client portal</option>
              <option value="hide">Hide from the client portal</option>
            </Select>
          </Field>

          <Field label="Post a comment" hint="Left blank, nothing is posted">
            <Textarea
              name="postComment"
              rows={2}
              defaultValue={h.postComment ?? ""}
              placeholder="Moved to review automatically"
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-[13px] transition hover:bg-[var(--color-hover)]">
            <input
              type="checkbox"
              name="notifyChat"
              defaultChecked={h.notifyChat}
              className="accent-[var(--color-brand)]"
            />
            Announce in Rocket.Chat
          </label>

          <Field
            label="Webhook URL"
            hint="POSTs the ticket, project, from/to and who moved it"
          >
            <Input
              name="webhookUrl"
              defaultValue={h.webhookUrl ?? ""}
              placeholder="https://example.com/hooks/tracker"
            />
          </Field>
        </section>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-line)] pt-4">
          <SubmitButton size="sm">Save rules</SubmitButton>
        </div>
      </form>

      <div className="border-t border-[var(--color-line)] px-4 py-3">
        <form action={deleteTransitionAction}>
          <input type="hidden" name="id" value={transition.id} />
          <input
            type="hidden"
            name="workflowId"
            value={transition.workflowId}
          />
          <Button type="submit" variant="ghost" size="sm">
            <Trash2 size={14} />
            Delete transition
          </Button>
        </form>
      </div>
    </aside>
  );
}
