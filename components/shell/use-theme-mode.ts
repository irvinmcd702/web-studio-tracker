"use client";

import { useEffect, useState } from "react";

/**
 * The current theme, for the few components that cannot be styled with CSS
 * variables alone (React Flow, canvas drawing). Reads the attribute the
 * pre-paint script sets and follows it when the toggle changes it.
 */
export function useThemeMode(): "light" | "dark" {
  const [mode, setMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    const read = () =>
      setMode(
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      );

    read();

    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return mode;
}
