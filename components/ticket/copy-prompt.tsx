"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Hands the ticket over to whatever agent the developer works with, as text.
 *
 * This path calls nothing and sends nothing: it writes down what the tracker
 * already knows in the shape an agent can use, and the developer pastes it
 * wherever they work. It stays available on every project, including the ones
 * that do not allow their material to be sent anywhere — which is why it is
 * not the same feature as the drafting buttons.
 */
export function CopyPromptButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      // Clipboard refused (insecure context, denied permission): show the text
      // so it can still be selected by hand.
      setOpen(true);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check size={15} /> : <Sparkles size={15} />}
          {copied ? "Copied" : "Copy as prompt"}
        </Button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[12.5px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
        >
          {open ? "Hide" : "Preview"}
        </button>
      </div>

      {open ? (
        <div className="space-y-2">
          <pre className="max-h-72 overflow-auto rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-3)] p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap scroll-thin">
            {prompt}
          </pre>
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-brand)] hover:underline"
          >
            <Copy size={13} />
            Copy this text
          </button>
        </div>
      ) : null}
    </div>
  );
}
