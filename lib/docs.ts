import type { Prisma } from "@prisma/client";

import { prisma } from "./db";
import type { SessionUser } from "./auth";
import { projectScope } from "./permissions";

/**
 * Docs inherit their project's access rules; a doc with no project is a
 * studio-wide note that any staff member can read.
 *
 * Clients only ever see docs explicitly marked as shared, on a project whose
 * portal has documents switched on.
 */
export function docScope(user: SessionUser): Prisma.DocWhereInput {
  if (user.role === "CLIENT") {
    return {
      isClientVisible: true,
      project: {
        AND: [projectScope(user), { portalShowDocs: true }],
      },
    };
  }

  const scope = projectScope(user);

  // An empty scope means "every project" (admins and managers). Passing it
  // through as a relation filter would silently match nothing, so short-circuit.
  if (Object.keys(scope).length === 0) return {};

  return {
    OR: [{ projectId: null }, { project: { is: scope } }],
  };
}

export async function canReadDoc(user: SessionUser, docId: string) {
  const found = await prisma.doc.findFirst({
    where: { AND: [{ id: docId }, docScope(user)] },
    select: { id: true },
  });
  return Boolean(found);
}

/** Staff write docs; clients never do. */
export function canWriteDocs(user: SessionUser) {
  return user.role !== "CLIENT";
}

/**
 * A one-line preview for the card. Headings are skipped where possible: most
 * docs open with a heading that repeats the title, and printing it twice tells
 * the reader nothing about what is inside.
 */
export function docExcerpt(body: string, max = 160) {
  const lines = body.split("\n");

  const clean = (line: string) => line.replace(/^[#>\-*\s]+/, "").trim();

  // A heading usually repeats the title and a table row reads as gibberish out
  // of context, so both are a last resort rather than a first choice.
  const isPoorPreview = (line: string) => {
    const trimmed = line.trimStart();
    return trimmed.startsWith("#") || trimmed.startsWith("|");
  };

  const pick = (candidates: string[]) =>
    candidates.map(clean).find((l) => l.length > 0);

  const line = pick(lines.filter((l) => !isPoorPreview(l))) ?? pick(lines);

  if (!line) return null;
  return line.length > max ? `${line.slice(0, max)}…` : line;
}
