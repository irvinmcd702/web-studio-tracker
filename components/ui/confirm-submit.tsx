"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A destructive submit that asks once, inline.
 *
 * Deliberately not `window.confirm` (it blocks the whole tab and reads as a
 * browser error) and not a modal (too heavy for one button): the first click
 * arms the action, the second one runs it, and the question sits exactly where
 * the answer will land. It disarms itself after a few seconds so a stray click
 * doesn't leave a live trigger on the page.
 */
export function ConfirmSubmit({
  children,
  question = "Sure?",
  confirmLabel = "Delete",
  size = "sm",
  className,
}: {
  children: React.ReactNode;
  question?: string;
  confirmLabel?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!armed || pending) return;
    timer.current = setTimeout(() => setArmed(false), 6000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [armed, pending]);

  if (!armed) {
    return (
      <Button
        type="button"
        variant="danger"
        size={size}
        className={className}
        onClick={() => setArmed(true)}
      >
        {children}
      </Button>
    );
  }

  return (
    <span
      className={cn("inline-flex flex-wrap items-center gap-2", className)}
      role="group"
    >
      <span className="text-[12.5px] text-[var(--color-muted)]">
        {question}
      </span>
      <Button type="submit" variant="danger" size={size} disabled={pending}>
        {pending ? "Deleting…" : confirmLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size={size}
        onClick={() => setArmed(false)}
        disabled={pending}
      >
        Cancel
      </Button>
    </span>
  );
}

/**
 * The small icon buttons that remove one row (a crew member, a file, a team
 * member). Same two-step, but it turns into a check and a cross so the row
 * doesn't jump in height.
 */
export function ConfirmIconSubmit({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();

  useEffect(() => {
    if (!armed || pending) return;
    const id = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(id);
  }, [armed, pending]);

  if (!armed) {
    return (
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={() => setArmed(true)}
        className={cn(
          "rounded-md p-1.5 text-[var(--color-muted)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]",
          className,
        )}
      >
        {children}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="submit"
        disabled={pending}
        title={`${title}: confirm`}
        className="rounded-md bg-[var(--color-danger)] px-2 py-1 text-[11.5px] font-medium text-[var(--color-on-danger)] disabled:opacity-60"
      >
        {pending ? "…" : "Remove"}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        disabled={pending}
        title="Cancel"
        className="rounded-md px-1.5 py-1 text-[11.5px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
      >
        Cancel
      </button>
    </span>
  );
}
