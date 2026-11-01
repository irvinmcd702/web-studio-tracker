import { prisma } from "./db";

/**
 * "@dana, can you look at this."
 *
 * The tracker already had a notification layer — a chat integration, a morning
 * letter, an attention panel — and no way at all to point at one person. This
 * is that.
 *
 * Two rules shape the whole thing.
 *
 * **A mention can only reach somebody who could already see the thing.**
 * Resolution runs against the people with access to that project, so typing
 * `@ivan` on a project Ivan is not on creates nothing. It has to work that way
 * round: the excerpt travels with the mention, and an excerpt is a piece of a
 * client's ticket. Naming a stranger must not post it to them.
 *
 * **Only staff.** Portal users are deliberately not mentionable: they have no
 * dashboard to see it on, and a notification that half works is worse than an
 * honest absence. A client writing in the portal chat already notifies the
 * studio by existing.
 */

/** Everything a handle is allowed to be, and nothing else. */
export function handleShape(raw: string) {
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .replace(/^[.\-_]+|[.\-_]+$/g, "")
      .slice(0, 30) || "person"
  );
}

/**
 * A handle nobody else has, derived from the email's local part — which is
 * what everybody half-uses anyway. Collisions get a number.
 */
export async function uniqueHandle(source: string) {
  const base = handleShape(source.split("@")[0] ?? source);

  let candidate = base;
  for (
    let n = 2;
    await prisma.user.findUnique({ where: { handle: candidate } });
    n++
  ) {
    candidate = `${base}${n}`;
  }
  return candidate;
}

/**
 * `@handle` — letters, digits, dot, dash, underscore. The trailing character
 * class stops a sentence's full stop being swallowed into the handle.
 */
const PATTERN =
  /(^|[^\w@])@([a-z0-9][a-z0-9._-]{0,30}?)(?=[^\w.-]|[.](?:\s|$)|$)/gi;

/** Every distinct handle written in a body, lowercased. */
export function parseHandles(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(PATTERN)) {
    found.add(match[2]!.toLowerCase().replace(/[.\-_]+$/, ""));
  }
  return [...found].filter(Boolean);
}

/** Roughly a sentence around the first mention, for the panel to show. */
export function excerptAround(body: string, handle: string, max = 140) {
  const at = body.toLowerCase().indexOf(`@${handle.toLowerCase()}`);
  const text = body.replace(/\s+/g, " ").trim();
  if (at < 0 || text.length <= max) return text.slice(0, max);

  const start = Math.max(0, at - Math.floor(max / 3));
  return (start > 0 ? "…" : "") + text.slice(start, start + max).trim() + "…";
}

/**
 * Attached to this project rather than merely able to open it. Somebody let
 * into a closed project by name counts: they were added to this project in
 * particular, which is what separates them from the run of the place.
 */
const ON_PROJECT = (projectId: string) => [
  { projectRoles: { some: { projectId } } },
  { managedProjects: { some: { id: projectId } } },
  { assignedTickets: { some: { projectId } } },
  { projectAccess: { some: { projectId } } },
];

/**
 * The staff who can open this project: its crew, its manager, anybody holding
 * one of its tickets, and everyone who can see every project anyway.
 *
 * `onProject` separates the last group from the rest. Both may be named — an
 * administrator can read the project either way, so there is nothing to
 * protect them from — but they are not the same thing to the person typing.
 * On a project of three, in a studio of eight managers, a flat list is eight
 * strangers stacked on top of the three people actually meant.
 */
export async function mentionableOn(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { isConfidential: true },
  });

  // On a closed project a manager is no longer nameable for being a manager.
  // This is the whole reason mentions resolve against project access rather
  // than against the staff list: the excerpt travels with the mention, and it
  // must not arrive at somebody who cannot open the thing it was cut from.
  const byRole: ("ADMIN" | "MANAGER")[] = project?.isConfidential
    ? ["ADMIN"]
    : ["ADMIN", "MANAGER"];

  const people = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: { in: byRole } }, ...ON_PROJECT(projectId)],
      // Portal users are not mentionable — see the note at the top.
      NOT: { role: "CLIENT" },
    },
    select: { id: true, name: true, handle: true, avatarColor: true },
    orderBy: { name: "asc" },
  });

  const attached = await prisma.user.findMany({
    where: { id: { in: people.map((p) => p.id) }, OR: ON_PROJECT(projectId) },
    select: { id: true },
  });
  const onProject = new Set(attached.map((p) => p.id));

  return people.map((person) => ({
    ...person,
    onProject: onProject.has(person.id),
  }));
}

/**
 * Records who was named. Returns the people who will actually hear about it,
 * which is not always who was typed.
 */
export async function recordMentions({
  body,
  projectId,
  ticketId = null,
  authorId,
}: {
  body: string;
  projectId: string;
  ticketId?: string | null;
  authorId: string;
}) {
  const handles = parseHandles(body);
  if (!handles.length) return [];

  const candidates = await mentionableOn(projectId);
  const byHandle = new Map(candidates.map((p) => [p.handle.toLowerCase(), p]));

  const targets = handles
    .map((h) => byHandle.get(h))
    .filter((p): p is (typeof candidates)[number] => Boolean(p))
    // Naming yourself is not a notification.
    .filter((p) => p.id !== authorId);

  if (!targets.length) return [];

  await prisma.mention.createMany({
    data: targets.map((person) => ({
      userId: person.id,
      authorId,
      projectId,
      ticketId,
      excerpt: excerptAround(body, person.handle),
    })),
  });

  return targets;
}

/**
 * Clears what somebody was going to be told about, because they are looking at
 * it. Called when the ticket or the project's chat is opened.
 */
export async function markMentionsRead({
  userId,
  ticketId,
  projectId,
}: {
  userId: string;
  ticketId?: string;
  projectId?: string;
}) {
  if (!ticketId && !projectId) return 0;

  const { count } = await prisma.mention.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ticketId ? { ticketId } : { projectId, ticketId: null }),
    },
    data: { readAt: new Date() },
  });
  return count;
}

/** Unread mentions for one person, newest first. */
export async function unreadMentions(userId: string, take = 20) {
  return prisma.mention.findMany({
    where: { userId, readAt: null },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      author: { select: { name: true } },
      project: { select: { id: true, key: true, name: true } },
      ticket: { select: { id: true, number: true } },
    },
  });
}

/**
 * Turns a body into parts, so a mention can be shown as one. Rendering, not
 * storage: the body keeps exactly what was typed.
 */
export function splitMentions(body: string, handles: Set<string>) {
  const parts: { text: string; mention: boolean }[] = [];
  let last = 0;

  for (const match of body.matchAll(PATTERN)) {
    const handle = match[2]!.toLowerCase().replace(/[.\-_]+$/, "");
    if (!handles.has(handle)) continue;

    const at = match.index! + match[1]!.length;
    if (at > last) parts.push({ text: body.slice(last, at), mention: false });
    parts.push({ text: `@${match[2]}`, mention: true });
    last = at + 1 + match[2]!.length;
  }

  if (last < body.length)
    parts.push({ text: body.slice(last), mention: false });
  return parts;
}
