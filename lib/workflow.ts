import { prisma } from "./db";

/**
 * A move is allowed when the workflow declares a matching transition.
 * Workflows with no transitions at all behave as "anything goes", so a freshly
 * created status set is usable before transitions are wired up.
 */
export async function isTransitionAllowed(
  workflowId: string,
  fromStatusId: string,
  toStatusId: string,
) {
  if (fromStatusId === toStatusId) return true;

  const total = await prisma.workflowTransition.count({
    where: { workflowId },
  });
  if (total === 0) return true;

  const match = await prisma.workflowTransition.findFirst({
    where: {
      workflowId,
      toStatusId,
      OR: [{ fromStatusId }, { fromStatusId: null }],
    },
  });
  return Boolean(match);
}

export const CANVAS_COLUMN = 260;
export const CANVAS_ROW = 160;
const CANVAS_WRAP = 4;

/**
 * Coordinates for the diagram, falling back to a tidy grid.
 *
 * Workflows created before the canvas existed have every status at (0, 0),
 * which would pile the whole diagram into one spot. Rather than migrating the
 * data, an unlaid-out workflow is arranged by board order on read; the moment
 * someone drags a node, real coordinates are written and this stops applying.
 */
export function withCanvasLayout<
  T extends { canvasX: number; canvasY: number; position: number },
>(statuses: T[]): T[] {
  const laidOut = statuses.some((s) => s.canvasX !== 0 || s.canvasY !== 0);
  if (laidOut) return statuses;

  return statuses.map((status, index) => ({
    ...status,
    canvasX: (index % CANVAS_WRAP) * CANVAS_COLUMN,
    canvasY: Math.floor(index / CANVAS_WRAP) * CANVAS_ROW,
  }));
}

/**
 * The arrow a move would travel along, or null when none exists.
 * A specific `from → to` arrow wins over a global "from any status" one, so a
 * targeted rule is never shadowed by the catch-all.
 */
export async function findTransition(
  workflowId: string,
  fromStatusId: string,
  toStatusId: string,
) {
  const candidates = await prisma.workflowTransition.findMany({
    where: {
      workflowId,
      toStatusId,
      OR: [{ fromStatusId }, { fromStatusId: null }],
    },
  });

  return (
    candidates.find((t) => t.fromStatusId === fromStatusId) ??
    candidates.find((t) => t.fromStatusId === null) ??
    null
  );
}

/**
 * For every status of the workflow, the ids it can move to.
 * Used by the board to grey out illegal drop targets before the round-trip.
 */
export async function transitionMap(workflowId: string) {
  const [statuses, transitions] = await Promise.all([
    prisma.workflowStatus.findMany({
      where: { workflowId },
      orderBy: { position: "asc" },
    }),
    prisma.workflowTransition.findMany({ where: { workflowId } }),
  ]);

  const map: Record<string, string[]> = {};

  for (const status of statuses) {
    if (transitions.length === 0) {
      map[status.id] = statuses.map((s) => s.id);
      continue;
    }
    const targets = new Set<string>([status.id]);
    for (const t of transitions) {
      if (t.fromStatusId === status.id || t.fromStatusId === null) {
        targets.add(t.toStatusId);
      }
    }
    map[status.id] = [...targets];
  }

  return map;
}

/** Statuses a ticket in `fromStatusId` may move to, in board order. */
export async function allowedTargets(workflowId: string, fromStatusId: string) {
  const statuses = await prisma.workflowStatus.findMany({
    where: { workflowId },
    orderBy: { position: "asc" },
  });

  const transitions = await prisma.workflowTransition.findMany({
    where: { workflowId },
  });

  if (transitions.length === 0) {
    return statuses.filter((s) => s.id !== fromStatusId);
  }

  const reachable = new Set(
    transitions
      .filter((t) => t.fromStatusId === fromStatusId || t.fromStatusId === null)
      .map((t) => t.toStatusId),
  );

  return statuses.filter((s) => s.id !== fromStatusId && reachable.has(s.id));
}

/**
 * Where a ticket lands when its project moves to a different workflow.
 *
 * Same status name first, because a "QA" that exists in both workflows means
 * the same thing to the people using it. Failing that, the first status of the
 * same category, which keeps a ticket roughly where it was in the run of work.
 * Failing that, the initial status — the only honest fallback, since guessing
 * further would scatter tickets into positions nobody chose.
 *
 * Pure, and separate from the action that calls it, because this is the rule
 * that quietly moves every ticket on a project at once.
 */
export function remapStatus<
  T extends { id: string; name: string; category: string },
>(from: { name: string; category: string }, targets: T[], initial: T): T {
  const byName = targets.find((s) => s.name === from.name);
  if (byName) return byName;

  const byCategory = targets.find((s) => s.category === from.category);
  if (byCategory) return byCategory;

  return initial;
}
