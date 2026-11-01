"use client";

import { useEffect, useState } from "react";
import { Check, GitBranch } from "lucide-react";

/**
 * The branch name to use, so the ticket key survives into git and comes back
 * on the webhook. Copying it is one click; typing it from memory is how the
 * key gets lost.
 */
export function BranchName({ branch }: { branch: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const command = `git checkout -b ${branch}`;

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(command);
          setCopied(true);
        } catch {
          /* clipboard blocked: the text is on screen to select by hand */
        }
      }}
      title="Copy: git checkout -b …"
      className="group flex w-full items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-3)] px-2.5 py-2 text-left font-mono text-[11.5px] transition-colors duration-[var(--dur-fast)] hover:border-[var(--color-line-strong)]"
    >
      {copied ? (
        <Check size={13} className="shrink-0 text-[var(--color-ok)]" />
      ) : (
        <GitBranch size={13} className="shrink-0 text-[var(--color-faint)]" />
      )}
      <span className="min-w-0 flex-1 truncate">{branch}</span>
      <span className="shrink-0 font-sans text-[11px] text-[var(--color-muted)]">
        {copied ? "copied" : "copy"}
      </span>
    </button>
  );
}
