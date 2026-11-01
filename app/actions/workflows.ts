"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import {
  isSafeWebhookUrl,
  parseConditions,
  parseHooks,
} from "@/lib/workflow-rules";
import type { ActionState } from "@/components/ui/form";

async function assertConfigurer() {
  const user = await requireUser();
  if (!canConfigure(user)) {
    throw new Error("You don't have permission to manage workflows");
  }
  return user;
}

const PRESETS: Record<
  string,
  {
    statuses: {
      name: string;
      category: "TODO" | "IN_PROGRESS" | "DONE";
      color: string;
    }[];
  }
> = {
  simple: {
    statuses: [
      { name: "To do", category: "TODO", color: "#64748b" },
      { name: "In progress", category: "IN_PROGRESS", color: "#2563eb" },
      { name: "Done", category: "DONE", color: "#16a34a" },
    ],
  },
  dev: {
    statuses: [
      { name: "Backlog", category: "TODO", color: "#94a3b8" },
      { name: "To do", category: "TODO", color: "#64748b" },
      { name: "In development", category: "IN_PROGRESS", color: "#2563eb" },
      { name: "Code review", category: "IN_PROGRESS", color: "#7c3aed" },
      { name: "QA", category: "IN_PROGRESS", color: "#d97706" },
      { name: "Done", category: "DONE", color: "#16a34a" },
    ],
  },
  design: {
    statuses: [
      { name: "Brief", category: "TODO", color: "#94a3b8" },
      { name: "Concept", category: "IN_PROGRESS", color: "#db2777" },
      { name: "Design", category: "IN_PROGRESS", color: "#2563eb" },
      { name: "Client review", category: "IN_PROGRESS", color: "#d97706" },
      { name: "Approved", category: "DONE", color: "#16a34a" },
    ],
  },
  blank: { statuses: [] },
};

const workflowSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
  description: z.string().max(400).optional().nullable(),
});

export async function createWorkflowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertConfigurer();

  const parsed = workflowSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const preset = String(formData.get("preset") ?? "simple");
  const template = PRESETS[preset] ?? PRESETS.simple!;

  const exists = await prisma.workflow.findUnique({
    where: { name: parsed.data.name },
  });
  if (exists) return { error: "A workflow with this name already exists" };

  const workflow = await prisma.workflow.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      statuses: {
        create: template.statuses.map((s, i) => ({
          name: s.name,
          category: s.category,
          color: s.color,
          position: i,
          isInitial: i === 0,
          // Presets start life laid out left to right, wrapping every fourth.
          canvasX: (i % 4) * 260,
          canvasY: Math.floor(i / 4) * 160,
        })),
      },
    },
    include: { statuses: { orderBy: { position: "asc" } } },
  });

  // Chain the preset statuses so each one can move to the next and previous.
  const statuses = workflow.statuses;
  if (statuses.length > 1) {
    const pairs: { from: string; to: string; name: string }[] = [];
    for (let i = 0; i < statuses.length - 1; i++) {
      pairs.push({
        from: statuses[i]!.id,
        to: statuses[i + 1]!.id,
        name: `→ ${statuses[i + 1]!.name}`,
      });
      pairs.push({
        from: statuses[i + 1]!.id,
        to: statuses[i]!.id,
        name: `← ${statuses[i]!.name}`,
      });
    }
    await prisma.workflowTransition.createMany({
      data: pairs.map((p) => ({
        workflowId: workflow.id,
        fromStatusId: p.from,
        toStatusId: p.to,
        name: p.name,
      })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/workflows");
  redirect(`/workflows/${workflow.id}`);
}

export async function updateWorkflowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertConfigurer();
  const id = String(formData.get("id"));

  const parsed = workflowSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  await prisma.workflow.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
    },
  });

  revalidatePath(`/workflows/${id}`);
  revalidatePath("/workflows");
  return { ok: true };
}

export async function setDefaultWorkflowAction(formData: FormData) {
  await assertConfigurer();
  const id = String(formData.get("id"));

  await prisma.$transaction([
    prisma.workflow.updateMany({ data: { isDefault: false } }),
    prisma.workflow.update({ where: { id }, data: { isDefault: true } }),
  ]);

  revalidatePath("/workflows");
}

export async function duplicateWorkflowAction(formData: FormData) {
  await assertConfigurer();
  const id = String(formData.get("id"));

  const source = await prisma.workflow.findUnique({
    where: { id },
    include: { statuses: true, transitions: true },
  });
  if (!source) return;

  let name = `${source.name} (copy)`;
  for (let i = 2; await prisma.workflow.findUnique({ where: { name } }); i++) {
    name = `${source.name} (copy ${i})`;
  }

  const copy = await prisma.workflow.create({
    data: {
      name,
      description: source.description,
      statuses: {
        create: source.statuses
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            name: s.name,
            category: s.category,
            color: s.color,
            position: s.position,
            isInitial: s.isInitial,
          })),
      },
    },
    include: { statuses: true },
  });

  // Map old status ids → new ones so transitions can be recreated.
  const byName = new Map(copy.statuses.map((s) => [s.name, s.id]));
  const oldById = new Map(source.statuses.map((s) => [s.id, s]));

  const transitions = source.transitions
    .map((t) => {
      const toOld = oldById.get(t.toStatusId);
      const fromOld = t.fromStatusId ? oldById.get(t.fromStatusId) : null;
      if (!toOld) return null;
      const toId = byName.get(toOld.name);
      if (!toId) return null;
      const fromId = fromOld ? (byName.get(fromOld.name) ?? null) : null;
      if (fromOld && !fromId) return null;
      return {
        workflowId: copy.id,
        name: t.name,
        fromStatusId: fromId,
        toStatusId: toId,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  if (transitions.length) {
    await prisma.workflowTransition.createMany({
      data: transitions,
      skipDuplicates: true,
    });
  }

  revalidatePath("/workflows");
  redirect(`/workflows/${copy.id}`);
}

export async function deleteWorkflowAction(formData: FormData) {
  await assertConfigurer();
  const id = String(formData.get("id"));

  const inUse = await prisma.project.count({ where: { workflowId: id } });
  if (inUse > 0) {
    throw new Error(
      `This workflow is used by ${inUse} project(s) — switch them to another one first.`,
    );
  }

  await prisma.workflow.delete({ where: { id } });
  revalidatePath("/workflows");
  redirect("/workflows");
}

// --- statuses --------------------------------------------------------------

export async function addStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertConfigurer();
  const workflowId = String(formData.get("workflowId"));
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "TODO") as
    "TODO" | "IN_PROGRESS" | "DONE";
  const color = String(formData.get("color") ?? "#64748b");

  if (name.length < 2)
    return { error: "Status name must be at least 2 characters" };

  const duplicate = await prisma.workflowStatus.findFirst({
    where: { workflowId, name },
  });
  if (duplicate)
    return { error: "This workflow already has a status with that name" };

  const count = await prisma.workflowStatus.count({ where: { workflowId } });

  await prisma.workflowStatus.create({
    data: {
      workflowId,
      name,
      category,
      color,
      position: count,
      isInitial: count === 0,
      // Drop it in a readable row rather than on top of the first node.
      canvasX: (count % 4) * 260,
      canvasY: Math.floor(count / 4) * 160,
    },
  });

  revalidatePath(`/workflows/${workflowId}`);
  return { ok: true };
}

export async function updateStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertConfigurer();
  const id = String(formData.get("id"));
  const workflowId = String(formData.get("workflowId"));
  const name = String(formData.get("name") ?? "").trim();

  if (name.length < 2)
    return { error: "Status name must be at least 2 characters" };

  const duplicate = await prisma.workflowStatus.findFirst({
    where: { workflowId, name, NOT: { id } },
  });
  if (duplicate)
    return { error: "This workflow already has a status with that name" };

  await prisma.workflowStatus.update({
    where: { id },
    data: {
      name,
      category: String(formData.get("category") ?? "TODO") as
        "TODO" | "IN_PROGRESS" | "DONE",
      color: String(formData.get("color") ?? "#64748b"),
    },
  });

  revalidatePath(`/workflows/${workflowId}`);
  return { ok: true };
}

export async function deleteStatusAction(formData: FormData) {
  await assertConfigurer();
  const id = String(formData.get("id"));
  const workflowId = String(formData.get("workflowId"));

  const used = await prisma.ticket.count({ where: { statusId: id } });
  if (used > 0) {
    throw new Error(`${used} ticket(s) are in this status — move them first.`);
  }

  await prisma.workflowStatus.delete({ where: { id } });

  // Keep exactly one initial status.
  const remaining = await prisma.workflowStatus.findMany({
    where: { workflowId },
    orderBy: { position: "asc" },
  });
  if (remaining.length && !remaining.some((s) => s.isInitial)) {
    await prisma.workflowStatus.update({
      where: { id: remaining[0]!.id },
      data: { isInitial: true },
    });
  }

  revalidatePath(`/workflows/${workflowId}`);
}

export async function moveStatusAction(formData: FormData) {
  await assertConfigurer();
  const id = String(formData.get("id"));
  const workflowId = String(formData.get("workflowId"));
  const direction = String(formData.get("direction")) === "up" ? -1 : 1;

  const statuses = await prisma.workflowStatus.findMany({
    where: { workflowId },
    orderBy: { position: "asc" },
  });

  const index = statuses.findIndex((s) => s.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= statuses.length) return;

  const a = statuses[index]!;
  const b = statuses[target]!;

  await prisma.$transaction([
    prisma.workflowStatus.update({
      where: { id: a.id },
      data: { position: b.position },
    }),
    prisma.workflowStatus.update({
      where: { id: b.id },
      data: { position: a.position },
    }),
  ]);

  revalidatePath(`/workflows/${workflowId}`);
}

export async function setInitialStatusAction(formData: FormData) {
  await assertConfigurer();
  const id = String(formData.get("id"));
  const workflowId = String(formData.get("workflowId"));

  await prisma.$transaction([
    prisma.workflowStatus.updateMany({
      where: { workflowId },
      data: { isInitial: false },
    }),
    prisma.workflowStatus.update({ where: { id }, data: { isInitial: true } }),
  ]);

  revalidatePath(`/workflows/${workflowId}`);
}

// --- transitions -----------------------------------------------------------

export async function addTransitionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertConfigurer();
  const workflowId = String(formData.get("workflowId"));
  const rawFrom = String(formData.get("fromStatusId") ?? "");
  const fromStatusId = rawFrom === "ANY" || rawFrom === "" ? null : rawFrom;
  const toStatusId = String(formData.get("toStatusId") ?? "");

  if (!toStatusId) return { error: "Pick a target status" };
  if (fromStatusId === toStatusId) {
    return { error: "A transition can't lead to the same status" };
  }

  const exists = await prisma.workflowTransition.findFirst({
    where: { workflowId, fromStatusId, toStatusId },
  });
  if (exists) return { error: "This transition already exists" };

  const to = await prisma.workflowStatus.findUnique({
    where: { id: toStatusId },
  });
  if (!to) return { error: "Status not found" };

  const name = String(formData.get("name") ?? "").trim() || `→ ${to.name}`;

  await prisma.workflowTransition.create({
    data: { workflowId, fromStatusId, toStatusId, name },
  });

  revalidatePath(`/workflows/${workflowId}`);
  return { ok: true };
}

/**
 * Persists the diagram layout. Called after a drag settles, so it takes the
 * whole node set at once rather than one status per request.
 */
export async function saveWorkflowLayoutAction(
  workflowId: string,
  nodes: { id: string; x: number; y: number }[],
): Promise<{ error?: string }> {
  try {
    await assertConfigurer();

    const owned = await prisma.workflowStatus.findMany({
      where: { workflowId },
      select: { id: true },
    });
    const allowed = new Set(owned.map((s) => s.id));

    const updates = nodes
      .filter((n) => allowed.has(n.id))
      .filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y))
      .map((n) =>
        prisma.workflowStatus.update({
          where: { id: n.id },
          data: { canvasX: Math.round(n.x), canvasY: Math.round(n.y) },
        }),
      );

    if (updates.length) await prisma.$transaction(updates);

    revalidatePath(`/workflows/${workflowId}`);
    return {};
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Couldn't save the layout",
    };
  }
}

/** Draws a new arrow by dragging between two nodes on the canvas. */
export async function connectStatusesAction(
  workflowId: string,
  fromStatusId: string | null,
  toStatusId: string,
): Promise<{ error?: string }> {
  try {
    await assertConfigurer();

    if (fromStatusId === toStatusId) {
      return { error: "A transition can't lead to the same status" };
    }

    const statuses = await prisma.workflowStatus.findMany({
      where: { workflowId },
      select: { id: true, name: true },
    });
    const byId = new Map(statuses.map((s) => [s.id, s]));

    if (!byId.has(toStatusId)) return { error: "Status not found" };
    if (fromStatusId && !byId.has(fromStatusId)) {
      return { error: "Status not found" };
    }

    const exists = await prisma.workflowTransition.findFirst({
      where: { workflowId, fromStatusId, toStatusId },
    });
    if (exists) return { error: "This transition already exists" };

    await prisma.workflowTransition.create({
      data: {
        workflowId,
        fromStatusId,
        toStatusId,
        name: `→ ${byId.get(toStatusId)!.name}`,
      },
    });

    revalidatePath(`/workflows/${workflowId}`);
    return {};
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Couldn't create the transition",
    };
  }
}

/** Saves the name, conditions and hooks edited in the arrow's side panel. */
export async function updateTransitionRulesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertConfigurer();

  const id = String(formData.get("id"));
  const transition = await prisma.workflowTransition.findUnique({
    where: { id },
  });
  if (!transition) return { error: "Transition not found" };

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1) return { error: "Give the transition a label" };

  const webhookUrl = String(formData.get("webhookUrl") ?? "").trim();
  if (webhookUrl && !isSafeWebhookUrl(webhookUrl)) {
    return { error: "The webhook URL must be an http(s) address" };
  }

  const rawVisible = String(formData.get("setClientVisible") ?? "");

  const conditions = parseConditions({
    roles: formData.getAll("roles").map(String),
    assigneeOnly: formData.get("assigneeOnly") === "on",
    requireAssignee: formData.get("requireAssignee") === "on",
    requireEstimate: formData.get("requireEstimate") === "on",
    requireDescription: formData.get("requireDescription") === "on",
    requireAcceptance: formData.get("requireAcceptance") === "on",
    requireComment: formData.get("requireComment") === "on",
    requireVisitedStatusId: String(
      formData.get("requireVisitedStatusId") ?? "",
    ),
  });

  const hooks = parseHooks({
    assignToActor: formData.get("assignToActor") === "on",
    clearAssignee: formData.get("clearAssignee") === "on",
    setPriority: String(formData.get("setPriority") ?? ""),
    setClientVisible:
      rawVisible === "show" ? true : rawVisible === "hide" ? false : null,
    postComment: String(formData.get("postComment") ?? ""),
    notifyChat: formData.get("notifyChat") === "on",
    webhookUrl,
  });

  if (hooks.assignToActor && hooks.clearAssignee) {
    return { error: "Pick either assigning or unassigning, not both" };
  }

  await prisma.workflowTransition.update({
    where: { id },
    data: { name, conditions, hooks },
  });

  revalidatePath(`/workflows/${transition.workflowId}`);
  return { ok: true };
}

export async function deleteTransitionAction(formData: FormData) {
  await assertConfigurer();
  const id = String(formData.get("id"));
  const workflowId = String(formData.get("workflowId"));

  await prisma.workflowTransition.delete({ where: { id } });
  revalidatePath(`/workflows/${workflowId}`);
}
