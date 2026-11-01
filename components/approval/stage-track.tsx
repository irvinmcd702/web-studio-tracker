import { Check } from "lucide-react";

import { stageStateLabels, type Stage, type StageState } from "@/lib/approvals";
import { Badge } from "@/components/ui/primitives";

/**
 * The stages of a project drawn as the path they are.
 *
 * The list below this one is where a client reads a stage and decides on it;
 * this is only the shape of the whole thing, so the answer to "how far along
 * are we" does not have to be counted off a list of cards.
 *
 * The state is never carried by colour alone. Every stage that claims anything
 * says it in words on the pill, and the one being worked on is marked to a
 * screen reader as the current step rather than merely drawn brighter.
 */

/**
 * The circle, and the colour of the pill under it, per state.
 *
 * The circle is one whole string per state rather than a border class and a
 * fill class combined at render time. Two Tailwind utilities for the same
 * property are settled by the order they land in the stylesheet, not the order
 * they are written in the attribute, so a state assembled from parts is a
 * state whose colour is decided somewhere nobody is looking.
 */
const circle: Record<StageState, string> = {
  accepted: "border-[var(--color-ok)] bg-[var(--color-ok)] text-white",
  changes:
    "border-[var(--color-danger)] bg-[var(--color-surface)] text-[var(--color-ink-2)]",
  waiting:
    "border-[var(--color-warn)] bg-[var(--color-surface)] text-[var(--color-ink-2)]",
  active:
    "border-[var(--color-brand)] bg-[var(--color-surface)] text-[var(--color-ink-2)]",
  upcoming:
    "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-faint)]",
};

const pill: Partial<Record<StageState, string>> = {
  accepted: "#16a34a",
  changes: "#dc2626",
  waiting: "#d97706",
  active: "#2563eb",
};

export function StageTrack({ stages }: { stages: Stage[] }) {
  if (stages.length === 0) return null;

  return (
    <ol className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-stretch sm:justify-center sm:gap-0 sm:overflow-x-auto">
      {stages.map((stage, index) => {
        const label = stageStateLabels[stage.state];

        return (
          <li
            key={stage.id}
            aria-current={stage.isCurrent ? "step" : undefined}
            // Equal widths, but capped: three stages spread across a desktop
            // card put half a metre of dotted line between them.
            className="relative flex min-w-0 items-start gap-3 sm:max-w-56 sm:flex-1 sm:basis-0 sm:flex-col sm:items-center sm:gap-0 sm:px-2 sm:text-center"
          >
            {/* Joins this circle back to the one before it. Only where the
                stages sit side by side — stacked, the order reads by itself
                and a line between rows of uneven height buys nothing. */}
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-1/2 top-4 hidden h-px w-full border-t border-dashed border-[var(--color-line-strong)] sm:block"
              />
            ) : null}

            <span
              className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[12.5px] font-semibold tabular-nums ${circle[stage.state]}`}
            >
              {stage.state === "accepted" ? (
                <Check size={16} strokeWidth={3} aria-hidden="true" />
              ) : (
                stage.number
              )}
            </span>

            {/* A column, so the pills can be pushed to a common bottom. One
                stage's description wraps to two lines and its neighbour's to
                one, and a row of pills at four different heights reads as a
                mistake before it reads as anything else. */}
            <div className="min-w-0 sm:mt-3 sm:flex sm:w-full sm:flex-1 sm:flex-col">
              <p
                className={`text-[13.5px] font-semibold ${
                  stage.state === "upcoming"
                    ? "text-[var(--color-muted)]"
                    : "text-[var(--color-ink)]"
                }`}
              >
                {stage.title}
              </p>

              {stage.description ? (
                <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--color-muted)]">
                  {stage.description}
                </p>
              ) : null}

              {label ? (
                <span className="mt-2 inline-flex self-start sm:mt-auto sm:self-center sm:pt-2">
                  <Badge color={pill[stage.state]}>{label}</Badge>
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
