"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Copy, Sparkles, X } from "lucide-react";

import type { AiDraftState } from "@/app/actions/ai";
import { Button } from "@/components/ui/button";
import { FormError, SubmitButton } from "@/components/ui/form";

/**
 * Asks the model for something and shows what came back.
 *
 * The result is text on a page and nothing else — it is not saved, not sent to
 * the client, and not attached to anything. Whoever asked reads it and decides
 * what, if any, of it is worth typing somewhere real.
 */
export function AiSuggestion({
  action,
  fields,
  label,
  pendingText = "Thinking…",
  hint,
}: {
  action: (prev: AiDraftState, formData: FormData) => Promise<AiDraftState>;
  fields: Record<string, string>;
  label: string;
  pendingText?: string;
  hint?: string;
}) {
  const [state, submit] = useActionState(action, null);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (state?.text) setDismissed(false);
  }, [state]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  const showing = state?.text && !dismissed;

  return (
    <div className="space-y-3">
      <form action={submit} className="flex flex-wrap items-center gap-3">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <SubmitButton variant="secondary" size="sm" pendingText={pendingText}>
          <Sparkles size={15} />
          {label}
        </SubmitButton>
        {hint ? (
          <span className="text-[12.5px] text-[var(--color-muted)]">
            {hint}
          </span>
        ) : null}
      </form>

      <FormError message={state?.error} />

      {showing ? (
        <div className="rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-3)]">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-3 py-2">
            <span className="text-[12px] text-[var(--color-muted)]">
              A draft. Nothing has been saved
              {state.note ? ` · ${state.note}` : ""}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.text!);
                    setCopied(true);
                  } catch {
                    // Clipboard refused; the text is on screen to select by hand.
                  }
                }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDismissed(true)}
                aria-label="Discard this draft"
              >
                <X size={13} />
              </Button>
            </div>
          </div>
          <p className="max-h-96 overflow-auto p-3 text-[13px] leading-relaxed whitespace-pre-wrap scroll-thin">
            {state.text}
          </p>
        </div>
      ) : null}
    </div>
  );
}
