"use client";

import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export type CrewPerson = {
  id: string;
  name: string;
  position?: string | null;
  avatarColor: string;
  /** Standing teams they belong to — used for the one-click group add. */
  teams: string[];
};

/**
 * Picking who works on the project, person by person. Teams appear only as a
 * shortcut for adding several people at once: the project keeps the names, not
 * the team, so one developer can sit on three projects with a different role
 * on each.
 */
export function CrewPicker({
  people,
  defaultSelected = [],
  name = "memberIds",
}: {
  people: CrewPerson[];
  defaultSelected?: string[];
  name?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [query, setQuery] = useState("");

  const teams = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of people) {
      for (const team of person.teams) {
        counts.set(team, (counts.get(team) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "en-US"),
    );
  }, [people]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.position ?? "").toLowerCase().includes(needle) ||
        p.teams.some((t) => t.toLowerCase().includes(needle)),
    );
  }, [people, query]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const addTeam = (team: string) =>
    setSelected((current) => {
      const ids = people.filter((p) => p.teams.includes(team)).map((p) => p.id);
      const missing = ids.filter((id) => !current.includes(id));
      // Everyone already on? Then the button means"take them off again".
      return missing.length
        ? [...current, ...missing]
        : current.filter((id) => !ids.includes(id));
    });

  if (people.length === 0) {
    return (
      <div>
        <p className="label">People on this project</p>
        <p className="text-[13px] text-[var(--color-muted)]">
          No staff accounts yet — add people in the People section.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="label mb-0">People on this project</p>
        <span className="text-[12px] text-[var(--color-muted)]">
          {selected.length} selected
        </span>
      </div>

      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}

      {teams.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] text-[var(--color-muted)]">
            Add a whole team:
          </span>
          {teams.map(([team, count]) => (
            <button
              key={team}
              type="button"
              onClick={() => addTeam(team)}
              className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-[12px] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-hover)]"
            >
              {team} · {count}
            </button>
          ))}
        </div>
      ) : null}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Filter people by name, role or team"
        placeholder="Filter by name, role or team"
        className="field mb-2"
      />

      <div className="max-h-72 overflow-y-auto rounded-xl border border-[var(--color-line)] scroll-thin">
        {visible.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-[var(--color-muted)]">
            Nobody matches “{query}”.
          </p>
        ) : (
          visible.map((person) => {
            const on = selected.includes(person.id);
            return (
              <label
                key={person.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b border-[var(--color-line)] px-3 py-2 text-[13.5px] transition last:border-b-0",
                  on
                    ? "bg-[var(--color-brand-soft)]"
                    : "hover:bg-[var(--color-hover)]",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(person.id)}
                  className="accent-[var(--color-brand)]"
                />
                <Avatar
                  name={person.name}
                  color={person.avatarColor}
                  size={24}
                />
                <span className="flex-1">
                  {person.name}
                  {person.position ? (
                    <span className="ml-2 text-[12px] text-[var(--color-muted)]">
                      {person.position}
                    </span>
                  ) : null}
                </span>
                {person.teams.length ? (
                  <span className="text-[12px] text-[var(--color-muted)]">
                    {person.teams.join(", ")}
                  </span>
                ) : null}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
