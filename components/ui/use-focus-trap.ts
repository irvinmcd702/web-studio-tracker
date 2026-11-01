"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Keeps the keyboard inside an overlay while it is open, and gives focus back
 * to whatever opened it on close.
 *
 * Without this, Tab from a dialog walks into the page behind it: the user is
 * typing into a form they cannot see, and a screen reader reads the wrong
 * screen. `autoFocus` handles where focus lands first; pass false when the
 * overlay focuses something itself (a search box, for instance).
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  { autoFocus = true }: { autoFocus?: boolean } = {},
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;

    const container = ref.current;
    if (!container) return;

    const previous = document.activeElement as HTMLElement | null;

    if (autoFocus) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? container).focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const items = [
        ...container.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;

      if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      } else if (
        event.shiftKey &&
        (current === first || current === container)
      ) {
        event.preventDefault();
        last.focus();
      } else if (current instanceof Node && !container.contains(current)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Only take focus back if it is still inside the overlay we are closing.
      if (previous && document.body.contains(previous)) previous.focus();
    };
  }, [active, autoFocus]);

  return ref;
}
