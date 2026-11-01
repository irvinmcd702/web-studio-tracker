/**
 * The typing half of a mention: what someone is part-way through writing, and
 * what the text becomes once they pick somebody.
 *
 * This lives apart from `lib/mentions.ts` for two reasons. That file talks to
 * the database, and this one runs in the browser. And caret arithmetic is
 * exactly the kind of code that looks right and is off by one, so it is worth
 * having somewhere a test can reach it without a textarea.
 */

/** A half-written `@…`: where the `@` sits, and what follows it so far. */
export type MentionQuery = { at: number; text: string };

/**
 * `@` after a space or at the start, then the handle characters typed since.
 * The `[^\w@]` guard is what keeps an email address quiet: in `me@ex` the
 * character before `@` is a letter, so there is nothing to complete.
 */
const TRIGGER = /(?:^|[^\w@])@([a-z0-9._-]*)$/i;

/** What the caret is standing in, or null if it is not in a mention. */
export function mentionQueryAt(
  value: string,
  caret: number,
): MentionQuery | null {
  // Only what is behind the caret decides this. Going back to put a mention in
  // front of a word people have already written — `ping @ol|about the promo` —
  // is a normal thing to do, and refusing to help there is the whole complaint
  // this feature exists to answer. What follows the caret survives untouched.
  const match = TRIGGER.exec(value.slice(0, caret));
  if (!match) return null;

  const text = match[1]!;
  return { at: caret - text.length - 1, text: text.toLowerCase() };
}

/**
 * The people worth offering, best first.
 *
 * Whoever is on the project comes first, always. Everybody offered may be
 * named — they can all read the project — but on a project of three in a
 * studio of eight managers, a flat alphabetical list buries the three people
 * meant under strangers who happen to have the run of the place.
 *
 * Within each group: handle, then a name someone is spelling out, then
 * anything containing it. Someone typing `@an` means Anna far more often than
 * they mean Ivan, so a match at the start of a word beats one buried in the
 * middle.
 */
export function rankPeople<
  T extends { name: string; handle: string; onProject?: boolean },
>(people: T[], query: string, limit = 6): T[] {
  const group = (person: T) => (person.onProject === false ? 1 : 0);
  const q = query.toLowerCase();

  if (!q) {
    return [...people].sort((a, b) => group(a) - group(b)).slice(0, limit);
  }

  const score = (person: T) => {
    const handle = person.handle.toLowerCase();
    const name = person.name.toLowerCase();

    if (handle.startsWith(q)) return 0;
    if (name.split(/\s+/).some((word) => word.startsWith(q))) return 1;
    if (handle.includes(q) || name.includes(q)) return 2;
    return 3;
  };

  return (
    people
      .map((person) => ({ person, rank: score(person) }))
      .filter((row) => row.rank < 3)
      // Sorting is stable, so people who score the same stay in the order they
      // arrived — which is alphabetical.
      .sort((a, b) => group(a.person) - group(b.person) || a.rank - b.rank)
      .slice(0, limit)
      .map((row) => row.person)
  );
}

/**
 * The body with the half-written handle replaced by a whole one, and where the
 * caret belongs afterwards. The trailing space is deliberate: without it the
 * next character typed would still look like part of the handle, both to the
 * person reading it and to the parser.
 */
export function applyMention(
  value: string,
  query: MentionQuery,
  handle: string,
) {
  const rest = value.slice(query.at + 1 + query.text.length);
  // …unless there is already one there, which is what happens whenever the
  // mention is written into the middle of a sentence rather than at the end.
  const tail = /^\s/.test(rest) ? rest : ` ${rest}`;

  return {
    value: `${value.slice(0, query.at)}@${handle}${tail}`,
    caret: query.at + handle.length + 2,
  };
}
