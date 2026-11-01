"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useFocusTrap } from "./use-focus-trap";
import { buttonClass } from "./button";

/**
 * Disclosure-style modal: renders a trigger button and mounts its children in
 * an overlay while open. Forms inside get an `onDone` callback through
 * `ModalCloseContext` so a successful submit can close the dialog.
 */
const ModalCloseContext = React.createContext<() => void>(() => {});

export function useModalClose() {
  return React.useContext(ModalCloseContext);
}

export function Modal({
  trigger,
  triggerClassName,
  triggerLabel,
  title,
  description,
  children,
  width = "max-w-lg",
}: {
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** Required in practice for an icon-only trigger: an icon is not a name. */
  triggerLabel?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  width?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? buttonClass("primary", "sm")}
        title={triggerLabel}
        aria-label={triggerLabel}
      >
        {trigger}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--color-scrim)] p-4 backdrop-blur-[2px] sm:p-8">
          <div
            className="absolute inset-0"
            onClick={close}
            aria-hidden="true"
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            className={cn(
              "relative z-10 my-4 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] shadow-xl",
              width,
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--color-line)] px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold">{title}</h2>
                {description ? (
                  <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-md p-1 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)]"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <ModalCloseContext.Provider value={close}>
              <div className="px-5 py-4">{children}</div>
            </ModalCloseContext.Provider>
          </div>
        </div>
      ) : null}
    </>
  );
}
