"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

type Choice = "light" | "dark" | "system";

const STORAGE_KEY = "studio-theme";

const OPTIONS: { value: Choice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "Match the system", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

function apply(choice: Choice) {
  const resolved =
    choice === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : choice;

  document.documentElement.dataset.theme = resolved;

  if (choice === "system") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, choice);
}

/**
 * Three states rather than a switch: someone who never chose should keep
 * following their system when it flips at sunset.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setChoice(stored === "light" || stored === "dark" ? stored : "system");
    setReady(true);
  }, []);

  // Only while following the system: react to it changing under us.
  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  const pick = (next: Choice) => {
    setChoice(next);
    apply(next);
  };

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg border p-0.5"
      style={{ borderColor: "var(--color-line)" }}
      role="group"
      aria-label="Colour theme"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = ready && choice === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => pick(option.value)}
            title={option.label}
            aria-label={option.label}
            aria-pressed={active}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-md transition-colors",
              active
                ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-ink)]",
            )}
            style={{ transitionDuration: "var(--dur-fast)" }}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
}
