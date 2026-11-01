"use client";

import { useEffect } from "react";

/**
 * Re-applies the stored theme once React has taken over the document.
 *
 * The pre-paint script in <head> sets `data-theme` before the first frame, but
 * on the error and not-found routes hydration ends up dropping the attribute
 * again and the page snaps back to light. Re-applying here is cheap and keeps
 * every route honest, including the ones that render no toggle.
 */
export function ThemeSync() {
  useEffect(() => {
    const stored = localStorage.getItem("studio-theme");
    const resolved =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    if (document.documentElement.dataset.theme !== resolved) {
      document.documentElement.dataset.theme = resolved;
    }
  });

  return null;
}
