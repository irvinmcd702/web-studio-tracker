"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  importLeadsAction,
  previewLeadImportAction,
  type ImportPreviewState,
} from "@/app/actions/leads";
import {
  Field,
  FormError,
  Input,
  SubmitButton,
  Textarea,
} from "@/components/ui/form";

/**
 * Paste a list, see exactly what would happen, then commit it.
 *
 * Two steps rather than one because an import is not reversible in any useful
 * sense — the rows are people, and "undo" would mean deleting records somebody
 * may already have written a note against. The preview runs the same parse and
 * the same counting the commit will, so the two cannot disagree.
 */
export function ImportForm() {
  const [preview, previewAction] = useActionState<ImportPreviewState, FormData>(
    previewLeadImportAction,
    null,
  );
  const [commit, commitAction] = useActionState(importLeadsAction, null);
  const [text, setText] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (commit?.ok) router.push("/outreach/leads");
  }, [commit, router]);

  const ready = preview?.preview;

  return (
    <div className="space-y-6">
      <form action={previewAction} className="space-y-4">
        <FormError message={preview?.error} />

        <Field
          label="Where did this list come from"
          required
          hint="In your own words. Every lead in the file gets this sentence, and it is what the first message to them has to say."
        >
          <Textarea
            name="sourceDetail"
            rows={2}
            required
            maxLength={300}
            defaultValue={preview?.sourceDetail ?? ""}
            className="resize-none"
          />
        </Field>

        <Field
          label="Why the studio believes it may write to them"
          hint="Optional. The tracker cannot answer this for you — it only records the answer."
        >
          <Input
            name="consentNote"
            maxLength={300}
            defaultValue={preview?.consentNote ?? ""}
          />
        </Field>

        <Field label="What to call this list" hint="Shown on the import log.">
          <Input
            name="fileName"
            maxLength={120}
            placeholder="websummit-2026.csv"
            defaultValue={preview?.fileName ?? ""}
          />
        </Field>

        <Field
          label="The list"
          required
          hint="CSV or tab-separated, with a header row. A column called email, e-mail or mail is the only one that is required."
        >
          <Textarea
            name="text"
            rows={10}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"email,name,company\nada@example.com,Ada Lovelace,Analytical Engines"}
            className="resize-y font-mono text-[12.5px]"
          />
        </Field>

        <SubmitButton size="sm" variant="secondary" pendingText="Reading…">
          Check the list
        </SubmitButton>
      </form>

      {ready ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface-2)] p-5">
          <h3 className="text-[15px] font-semibold">What this would do</h3>

          <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
            <div>
              <dt className="text-[var(--color-muted)]">Imported</dt>
              <dd className="mt-0.5 text-[18px] font-semibold tabular-nums">
                {ready.imported}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Already known</dt>
              <dd className="mt-0.5 text-[18px] font-semibold tabular-nums">
                {ready.skippedDuplicate}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Suppressed</dt>
              <dd className="mt-0.5 text-[18px] font-semibold tabular-nums">
                {ready.skippedSuppressed}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Unreadable</dt>
              <dd className="mt-0.5 text-[18px] font-semibold tabular-nums">
                {ready.skippedInvalid}
              </dd>
            </div>
          </dl>

          {preview?.headers?.length ? (
            <p className="mt-3 text-[12.5px] text-[var(--color-muted)]">
              Columns read: {preview.headers!.join(", ")}
            </p>
          ) : null}

          {preview?.problems?.length ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-[13px] font-medium">
                {preview.problems!.length} rows could not be used
              </summary>
              <ul className="mt-2 space-y-1 text-[12.5px] text-[var(--color-muted)]">
                {preview.problems!.slice(0, 25).map((problem, i) => (
                  <li key={i}>
                    Line {problem.line}: {problem.reason}
                    {problem.value ? ` — ${problem.value}` : ""}
                  </li>
                ))}
                {preview.problems!.length > 25 ? (
                  <li>…and {preview.problems!.length - 25} more</li>
                ) : null}
              </ul>
            </details>
          ) : null}

          <form action={commitAction} className="mt-5 space-y-3">
            <FormError message={commit?.error} />
            {/* The file that was previewed, so the commit cannot be a different one. */}
            <input type="hidden" name="text" value={preview?.text ?? ""} />
            <input
              type="hidden"
              name="fileName"
              value={preview?.fileName ?? ""}
            />
            <input
              type="hidden"
              name="sourceDetail"
              value={preview?.sourceDetail ?? ""}
            />
            <input
              type="hidden"
              name="consentNote"
              value={preview?.consentNote ?? ""}
            />
            <SubmitButton size="sm" pendingText="Importing…">
              Import {ready.imported} {ready.imported === 1 ? "lead" : "leads"}
            </SubmitButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}
