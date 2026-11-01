"use client";

import { useEffect } from "react";

import { buttonClass } from "@/components/ui/button";

/**
 * The last line of defence. It says what the person can do next and offers the
 * retry, instead of the framework's stack-trace screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-[22px] font-semibold">Something broke here</h1>
        <p className="mx-auto mt-2 max-w-[48ch] text-[13.5px] leading-relaxed text-[var(--color-muted)]">
          The action didn&apos;t go through. Nothing was half-saved: the page
          failed before writing anything. Try again, and if it keeps happening
          send this code to whoever runs the tracker.
        </p>
        {error.digest ? (
          <p className="num mt-3 inline-block rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-3)] px-2.5 py-1 font-mono text-[12px] text-[var(--color-ink-2)]">
            {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className={buttonClass("primary", "md")}
          >
            Try again
          </button>
          <a href="/dashboard" className={buttonClass("secondary", "md")}>
            Go to the dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
