"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Shows a one-time link once. It is never stored in readable form, so if it is
 * lost the only way forward is to issue a new one.
 */
export function CopyLink({
  link,
  expiresAt,
  hint,
}: {
  link: string;
  expiresAt?: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const expiryText = expiresAt
    ? new Date(expiresAt).toLocaleString("en-US", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-2 rounded-lg border border-[var(--color-ok-line)] bg-[var(--color-ok-soft)] px-3 py-3">
      <p className="text-[13px] font-medium text-[var(--color-ok)]">
        {hint ?? "Send this link to the person — it works once."}
      </p>

      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          aria-label="The link to send"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-[var(--color-ok-line)] bg-[var(--color-surface)] px-2 py-1.5 font-mono text-[12px]"
        />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              // Clipboard can be blocked; the field is selectable either way.
            }
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-surface)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--color-ok)] transition hover:bg-[var(--color-ok-soft)]"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {expiryText ? (
        <p className="text-[11.5px] text-[var(--color-ok)]">
          Valid until {expiryText}. It won&rsquo;t be shown again.
        </p>
      ) : null}
    </div>
  );
}
