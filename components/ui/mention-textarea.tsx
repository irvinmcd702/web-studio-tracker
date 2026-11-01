"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Avatar } from "@/components/ui/primitives";
import {
  applyMention,
  mentionQueryAt,
  rankPeople,
  type MentionQuery,
} from "@/lib/mention-query";
import { cn } from "@/lib/utils";

/** Somebody a mention here would actually reach. */
export type MentionPerson = {
  id: string;
  name: string;
  handle: string;
  avatarColor: string;
  /** On the project, rather than able to read every project. */
  onProject: boolean;
};

/**
 * The heading that belongs above row `i`, if any.
 *
 * Somebody who only has the run of every project gets one even when they are
 * the only match, because that label is the whole point: it says this person
 * is not on the project. The crew get one only when there is a second group
 * underneath to tell them apart from — a list with nothing to contrast
 * against needs no heading, and one that says nothing is just clutter.
 */
function heading(matches: MentionPerson[], i: number) {
  const person = matches[i]!;
  const previous = matches[i - 1];

  if (!person.onProject && (!previous || previous.onProject)) {
    return "Sees every project";
  }
  if (person.onProject && !previous && matches.some((p) => !p.onProject)) {
    return "On this project";
  }
  return null;
}

/**
 * A textarea that offers the people you can name.
 *
 * The list is only ever the people this mention would really reach — the crew
 * of this project, minus yourself, minus the client. Offering a name that
 * silently goes nowhere is the interface lying, and mentions are precisely the
 * feature where nobody finds out for a week.
 *
 * The field stays uncontrolled: these forms clear themselves with `reset()`
 * after a successful send, which React state would quietly ignore. Picking
 * somebody writes into the element and puts the caret back, the same as typing
 * would have.
 */
export function MentionTextarea({
  people,
  className,
  onKeyDown,
  onChange,
  onBlur,
  ...props
}: {
  people: MentionPerson[];
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [active, setActive] = useState(0);
  const listId = useId();

  // Escape means "not this one" — reopening on the next keystroke would make
  // the key useless. Dismissal sticks to the `@` it was aimed at, so starting
  // a new mention starts a new list.
  const dismissed = useRef<number | null>(null);

  const matches = query ? rankPeople(people, query.text) : [];
  const open = matches.length > 0;

  const sync = () => {
    const el = ref.current;
    if (!el || people.length === 0) return;

    const next = mentionQueryAt(el.value, el.selectionStart ?? 0);
    if (next && dismissed.current === next.at) return setQuery(null);
    if (!next) dismissed.current = null;

    setQuery((prev) =>
      prev && next && prev.at === next.at && prev.text === next.text
        ? prev
        : next,
    );
  };

  // A different thing is being typed, so start again from the top of the list.
  const typed = query?.text ?? null;
  useEffect(() => setActive(0), [typed]);

  const pick = (person: MentionPerson) => {
    const el = ref.current;
    if (!el || !query) return;

    const next = applyMention(el.value, query, person.handle);
    el.value = next.value;
    el.setSelectionRange(next.caret, next.caret);
    el.focus();

    setQuery(null);
    dismissed.current = null;
  };

  return (
    <div className="relative">
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="People you can mention"
          className="absolute bottom-full left-0 z-30 mb-1.5 w-full max-w-[20rem] overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-lg"
        >
          {matches.map((person, i) => (
            <div key={person.id} role="presentation">
              {heading(matches, i) ? (
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  {heading(matches, i)}
                </p>
              ) : null}
              <button
                type="button"
                role="option"
                id={`${listId}-${i}`}
                aria-selected={i === active}
                // Keeps the caret in the textarea: a blur here would close the
                // list before the click ever lands.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(person)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                  i === active && "bg-[var(--color-surface-3)]",
                )}
              >
                <Avatar
                  name={person.name}
                  color={person.avatarColor}
                  size={22}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-ink)]">
                  {person.name}
                </span>
                <span className="shrink-0 text-[12px] text-[var(--color-muted)]">
                  @{person.handle}
                </span>
              </button>
            </div>
          ))}
          <p className="border-t border-[var(--color-line)] px-3 py-1.5 text-[11px] text-[var(--color-muted)]">
            ↑↓ to choose · enter to insert
          </p>
        </div>
      ) : null}

      <textarea
        {...props}
        ref={ref}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        className={className}
        onChange={(e) => {
          sync();
          onChange?.(e);
        }}
        // The caret moves for reasons other than typing, and the list has to
        // follow it.
        onKeyUp={sync}
        onClick={sync}
        onBlur={(e) => {
          setQuery(null);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              return setActive((i) => (i + 1) % matches.length);
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              return setActive(
                (i) => (i - 1 + matches.length) % matches.length,
              );
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              return pick(matches[active] ?? matches[0]!);
            }
            if (e.key === "Escape") {
              e.preventDefault();
              // Whatever this field sits inside — a dialog, the palette —
              // should not also take this Escape as meant for it.
              e.stopPropagation();
              dismissed.current = query?.at ?? null;
              return setQuery(null);
            }
          }
          onKeyDown?.(e);
        }}
      />
    </div>
  );
}
