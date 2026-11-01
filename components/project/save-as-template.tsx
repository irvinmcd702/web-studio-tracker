"use client";

import { useActionState } from "react";
import { Copy } from "lucide-react";

import { saveProjectAsTemplateAction } from "@/app/actions/projects";
import { Modal } from "@/components/ui/modal";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

/**
 * Turning a project that went well into the next one's starting point.
 *
 * The dialog says what does not travel before it asks for a name. People
 * reasonably expect a template to carry everything, and finding out afterwards
 * that the assignees came too — or that they did not — is how a feature stops
 * being trusted.
 */
export function SaveAsTemplate({
  projectId,
  ticketCount,
}: {
  projectId: string;
  ticketCount: number;
}) {
  const [state, action] = useActionState(saveProjectAsTemplateAction, null);

  return (
    <Modal
      title="Save as template"
      description="So the next project of this shape starts with the tickets this one needed"
      trigger={
        <span className="inline-flex items-center gap-1.5">
          <Copy size={14} />
          Save as template
        </span>
      }
      triggerClassName="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-field)] border border-[var(--color-line)] px-2.5 text-[12.5px] font-medium text-[var(--color-ink-2)] transition hover:bg-[var(--color-hover)]"
    >
      {state?.ok ? (
        <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved. It is on the Templates page, ready for the next project.
        </p>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={projectId} />

          <div className="space-y-2 text-[13px] leading-relaxed">
            <p>
              <span className="font-medium">Travels:</span> all {ticketCount}{" "}
              tickets with their descriptions, acceptance criteria, types,
              priorities and estimates — plus the workflow, how this project is
              billed, and what the client can see.
            </p>
            <p>
              <span className="font-medium">Does not:</span> who each ticket is
              assigned to, and how far it has got. Work goes to whoever is on
              the next crew, and everything starts where the workflow starts.
            </p>
            <p className="text-[var(--color-muted)]">
              Dates are kept as &ldquo;so many days after the project
              starts&rdquo;, and only where this project has a start date to
              measure from.
            </p>
          </div>

          <FormError message={state?.error} />

          <Field label="Name" required>
            <Input
              name="templateName"
              placeholder="Small marketing site"
              required
              autoFocus
            />
          </Field>

          <Field
            label="What it is for"
            hint="Optional, but the next person will thank you"
          >
            <Textarea
              name="templateDescription"
              rows={3}
              placeholder="Five pages, a contact form and a map. Fixed price."
            />
          </Field>

          <SubmitButton size="sm">Save template</SubmitButton>
        </form>
      )}
    </Modal>
  );
}
