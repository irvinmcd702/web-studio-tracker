"use client";

import { useActionState } from "react";
import Link from "next/link";

import { updatePrivacyAction } from "@/app/actions/settings";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * The three things the portal's privacy notice cannot work out for itself.
 *
 * Everything else on that page — who receives a customer's data, how long it
 * is kept — is read from the live configuration, so it cannot claim an
 * integration that is switched off or a retention period nobody set.
 */
export function PrivacyForm({
  values,
}: {
  values: {
    studioLegalName: string | null;
    privacyContactEmail: string | null;
    privacyNoteExtra: string | null;
  };
}) {
  const [state, action] = useActionState(updatePrivacyAction, null);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state?.error} />
      {state?.ok ? (
        <p className="rounded-[var(--radius-field)] border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-2 text-[13px] text-[var(--color-ok)]">
          Saved
        </p>
      ) : null}

      <label className="block">
        <span className="label">Legal name of the studio</span>
        <input
          type="text"
          name="studioLegalName"
          defaultValue={values.studioLegalName ?? ""}
          placeholder="Example Studio Ltd"
          className="field"
        />
        <span className="hint">
          The entity a customer would name in a complaint. Until this is filled
          in, the notice tells them it is missing.
        </span>
      </label>

      <label className="block">
        <span className="label">Address for data requests</span>
        <input
          type="email"
          name="privacyContactEmail"
          defaultValue={values.privacyContactEmail ?? ""}
          placeholder="privacy@example.com"
          spellCheck={false}
          className="field"
        />
        <span className="hint">
          Where corrections and deletion requests land. Somebody has to read it.
        </span>
      </label>

      <label className="block">
        <span className="label">Your own wording</span>
        <textarea
          name="privacyNoteExtra"
          defaultValue={values.privacyNoteExtra ?? ""}
          rows={6}
          placeholder="Lawful basis, jurisdiction, your supervisory authority, anything your lawyer wants in there."
          className="field text-[13px]"
        />
        <span className="hint">
          Shown to customers as a section of its own. The tracker states what it
          does; the legal ground for doing it is yours to state, and it is not
          guessed for you.
        </span>
      </label>

      <SubmitButton size="sm">Save</SubmitButton>

      <p className="border-t border-[var(--color-line)] pt-3 text-[12.5px] text-[var(--color-muted)]">
        The customer&rsquo;s view is at{" "}
        <span className="font-mono">/portal/privacy</span>, linked from every
        portal page. What it says about recipients and retention is read from
        this configuration each time it loads — see{" "}
        <Link
          href="/settings"
          className="font-medium text-[var(--color-brand)] hover:underline"
        >
          the sections above
        </Link>
        .
      </p>
    </form>
  );
}
