"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  canAccessProject,
  canConfigure,
  canEditProject,
} from "@/lib/permissions";
import { remapStatus } from "@/lib/workflow";
import { logActivity } from "@/lib/activity";
import { describeStatusChange, recordTimeline } from "@/lib/timeline";
import { notifyProjectCreated } from "@/lib/notify";
import { normaliseChannel } from "@/lib/rocketchat";
import { readPortalValues } from "@/lib/portal";
import { getDefaultPortalValues, getStudioSettings } from "@/lib/settings";
import { slugToKey } from "@/lib/utils";
import {
  applyTemplateToProject,
  createTemplateFromProject,
} from "@/lib/templates";
import type { ActionState } from "@/components/ui/form";

async function assertProjectEditor(projectId?: string) {
  const user = await requireUser();
  if (!canEditProject(user))
    throw new Error("You don't have permission to do that");
  if (projectId && !(await canAccessProject(user, projectId))) {
    throw new Error("Project is not accessible");
  }
  return user;
}

function optionalDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return raw ? new Date(raw) : null;
}

function optionalNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Build a unique project key, e.g. "Acme Store" → ACMEST, ACMEST2, ACMEST3… */
async function uniqueKey(desired: string, fallbackSource: string) {
  const base =
    (desired.trim() ? slugToKey(desired) : slugToKey(fallbackSource)) || "PRJ";

  let key = base;
  for (let i = 2; await prisma.project.findUnique({ where: { key } }); i++) {
    key = `${base}${i}`;
  }
  return key;
}

const projectSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  description: z.string().max(4000).optional().nullable(),
  budgetType: z.enum(["HOURLY", "FIXED"]),
  currency: z.string().min(1).max(8),
});

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertProjectEditor();

  const parsed = projectSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    budgetType: String(formData.get("budgetType") ?? "HOURLY"),
    currency: String(formData.get("currency") ?? "USD"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  let workflowId = String(formData.get("workflowId") ?? "");
  if (!workflowId) {
    const fallback =
      (await prisma.workflow.findFirst({ where: { isDefault: true } })) ??
      (await prisma.workflow.findFirst({ orderBy: { createdAt: "asc" } }));
    if (!fallback) {
      return { error: "Create at least one workflow first" };
    }
    workflowId = fallback.id;
  }

  const key = await uniqueKey(
    String(formData.get("key") ?? ""),
    parsed.data.name,
  );

  const requestId = String(formData.get("requestId") ?? "") || null;
  const clientId = String(formData.get("clientId") ?? "") || null;
  const managerId = String(formData.get("managerId") ?? "") || null;

  // The create form submits the portal switches; anything else falls back to
  // the studio-wide defaults.
  const portal =
    formData.get("portalConfigured") === "1"
      ? readPortalValues(formData)
      : await getDefaultPortalValues();

  // Whether this project's material may be sent to the model provider. The
  // studio sets the default; the project keeps its own copy from then on.
  const { aiDefaultAllowed } = await getStudioSettings();

  const project = await prisma.project.create({
    data: {
      ...portal,
      aiAllowed: aiDefaultAllowed,
      key,
      name: parsed.data.name,
      description: parsed.data.description,
      status: (String(formData.get("status") ?? "ACTIVE") || "ACTIVE") as
        "DRAFT" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED",
      workflowId,
      clientId,
      rocketChatChannel: normaliseChannel(
        String(formData.get("rocketChatChannel") ?? ""),
      ),
      managerId: managerId ?? user.id,
      startDate: optionalDate(formData.get("startDate")),
      dueDate: optionalDate(formData.get("dueDate")),
      budgetType: parsed.data.budgetType,
      budgetHours:
        parsed.data.budgetType === "HOURLY"
          ? optionalNumber(formData.get("budgetHours"))
          : null,
      hourlyRate:
        parsed.data.budgetType === "HOURLY"
          ? optionalNumber(formData.get("hourlyRate"))
          : null,
      fixedAmount:
        parsed.data.budgetType === "FIXED"
          ? optionalNumber(formData.get("fixedAmount"))
          : null,
      currency: parsed.data.currency,
    },
  });

  const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  if (memberIds.length) {
    // Only real staff accounts — a tampered form must not add a client to a crew.
    const staff = await prisma.user.findMany({
      where: {
        id: { in: memberIds },
        isActive: true,
        role: { in: ["ADMIN", "MANAGER", "MEMBER"] },
      },
      select: { id: true, position: true },
    });

    await prisma.projectMember.createMany({
      data: staff.map((person) => ({
        projectId: project.id,
        userId: person.id,
        role: person.position,
      })),
      skipDuplicates: true,
    });
  }

  if (requestId) {
    const previous = await prisma.clientRequest.findUnique({
      where: { id: requestId },
      select: { status: true },
    });
    await prisma.clientRequest.update({
      where: { id: requestId },
      data: { status: "CONVERTED", projectId: project.id },
    });
    // Conversion sets the status without going through the triage form, so
    // the entry has to be written here too — otherwise the one move that
    // matters most is the one the diary misses.
    if (previous && previous.status !== "CONVERTED") {
      await recordTimeline({
        kind: "STATUS",
        summary: describeStatusChange(previous.status, "CONVERTED"),
        body: `Became the project ${project.key} — ${project.name}.`,
        userId: user.id,
        requestId,
      });
    }
    // Carry the request's files over to the new project.
    await prisma.attachment.updateMany({
      where: { requestId },
      data: { projectId: project.id },
    });
  }

  // The tickets a template starts with. After the crew, so nothing is assigned
  // to somebody who is not on it; after the project exists, so they inherit the
  // workflow that was actually chosen on the form.
  const templateId = String(formData.get("templateId") ?? "") || null;
  let fromTemplate = 0;
  if (templateId) {
    const applied = await applyTemplateToProject({
      templateId,
      projectId: project.id,
    });
    fromTemplate = applied.created;
  }

  await logActivity({
    type: "project.created",
    message: requestId
      ? "created the project from a request"
      : fromTemplate > 0
        ? `created the project from a template, with ${fromTemplate} ticket(s)`
        : "created the project",
    userId: user.id,
    projectId: project.id,
  });

  const [client, manager] = await Promise.all([
    clientId ? prisma.client.findUnique({ where: { id: clientId } }) : null,
    project.managerId
      ? prisma.user.findUnique({ where: { id: project.managerId } })
      : null,
  ]);

  await notifyProjectCreated({
    project,
    clientName: client?.name ?? null,
    managerName: manager?.name ?? null,
    actorName: user.name,
  });

  revalidatePath("/projects");
  revalidatePath("/requests");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const user = await assertProjectEditor(id);

  const parsed = projectSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    budgetType: String(formData.get("budgetType") ?? "HOURLY"),
    currency: String(formData.get("currency") ?? "USD"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  await prisma.project.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      status: String(formData.get("status") ?? "ACTIVE") as
        "DRAFT" | "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED",
      clientId: String(formData.get("clientId") ?? "") || null,
      managerId: String(formData.get("managerId") ?? "") || null,
      rocketChatChannel: normaliseChannel(
        String(formData.get("rocketChatChannel") ?? ""),
      ),
      startDate: optionalDate(formData.get("startDate")),
      dueDate: optionalDate(formData.get("dueDate")),
      budgetType: parsed.data.budgetType,
      budgetHours:
        parsed.data.budgetType === "HOURLY"
          ? optionalNumber(formData.get("budgetHours"))
          : null,
      hourlyRate:
        parsed.data.budgetType === "HOURLY"
          ? optionalNumber(formData.get("hourlyRate"))
          : null,
      fixedAmount:
        parsed.data.budgetType === "FIXED"
          ? optionalNumber(formData.get("fixedAmount"))
          : null,
      currency: parsed.data.currency,
    },
  });

  await logActivity({
    type: "project.updated",
    message: "updated the project settings",
    userId: user.id,
    projectId: id,
  });

  revalidatePath(`/projects/${id}`, "layout");
  revalidatePath("/projects");
  return { ok: true };
}

export async function changeProjectWorkflowAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const user = await assertProjectEditor(id);
  const workflowId = String(formData.get("workflowId"));

  const [project, target] = await Promise.all([
    prisma.project.findUnique({ where: { id } }),
    prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { statuses: { orderBy: { position: "asc" } } },
    }),
  ]);
  if (!project || !target) return { error: "Workflow not found" };
  if (project.workflowId === workflowId) return { ok: true };

  const initial =
    target.statuses.find((s) => s.isInitial) ?? target.statuses[0];
  if (!initial) {
    return { error: "The selected workflow has no statuses" };
  }

  // Re-map existing tickets: same status name if it exists, otherwise the
  // first status of the same category, otherwise the initial status.
  const tickets = await prisma.ticket.findMany({
    where: { projectId: id },
    include: { status: true },
  });

  await prisma.$transaction([
    ...tickets.map((ticket) =>
      prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          statusId: remapStatus(ticket.status, target.statuses, initial).id,
        },
      }),
    ),
    prisma.project.update({ where: { id }, data: { workflowId } }),
  ]);

  await logActivity({
    type: "project.workflow_changed",
    message: `switched the workflow to “${target.name}”`,
    userId: user.id,
    projectId: id,
  });

  revalidatePath(`/projects/${id}`, "layout");
  return { ok: true };
}

export async function updatePortalSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const user = await assertProjectEditor(id);

  const on = (name: string) => formData.get(name) === "on";

  await prisma.project.update({
    where: { id },
    data: {
      portalShowDescription: on("portalShowDescription"),
      portalShowDueDate: on("portalShowDueDate"),
      portalShowTasks: on("portalShowTasks"),
      portalShowChat: on("portalShowChat"),
      portalShowFiles: on("portalShowFiles"),
      portalAllowUploads: on("portalAllowUploads"),
      portalShowHours: on("portalShowHours"),
      portalShowMoney: on("portalShowMoney"),
      portalShowTeam: on("portalShowTeam"),
      portalShowApprovals: on("portalShowApprovals"),
      portalShowDocs: on("portalShowDocs"),
      portalShowAgentHours: on("portalShowAgentHours"),
    },
  });

  await logActivity({
    type: "project.portal_updated",
    message: "changed what the client sees in the portal",
    userId: user.id,
    projectId: id,
  });

  revalidatePath(`/projects/${id}`, "layout");
  revalidatePath(`/portal/${id}`);
  return { ok: true };
}

/** Staff who may be put on a crew — clients and deactivated accounts never can. */
async function assignableStaff(ids: string[]) {
  if (!ids.length) return [];
  return prisma.user.findMany({
    where: {
      id: { in: ids },
      isActive: true,
      role: { in: ["ADMIN", "MANAGER", "MEMBER"] },
    },
    select: { id: true, name: true, position: true },
  });
}

export async function addProjectMemberAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const user = await assertProjectEditor(projectId);

  const userId = String(formData.get("userId"));
  const role = String(formData.get("role") ?? "").trim();
  if (!userId) return;

  const [person] = await assignableStaff([userId]);
  if (!person) return;

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role: role || person.position },
    // Re-adding someone who is already on the crew updates their role instead
    // of failing — that is what the person clicking the button meant.
    update: { role: role || undefined },
  });

  await logActivity({
    type: "project.member_added",
    message: `put ${person.name} on the project`,
    userId: user.id,
    projectId,
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath(`/portal/${projectId}`);
}

/**
 * Pull a whole standing team onto the crew in one click. The team is a source
 * of names, not an attachment: removing someone afterwards is a normal edit,
 * and later changes to the team do not reach the project.
 */
export async function addTeamToProjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const user = await assertProjectEditor(projectId);
  const teamId = String(formData.get("teamId"));
  if (!teamId) return;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: true },
  });
  if (!team) return;

  const staff = await assignableStaff(team.members.map((m) => m.userId));
  const titleByUser = new Map(team.members.map((m) => [m.userId, m.title]));

  const added = await prisma.projectMember.createMany({
    data: staff.map((person) => ({
      projectId,
      userId: person.id,
      role: titleByUser.get(person.id) ?? person.position,
    })),
    skipDuplicates: true,
  });

  await logActivity({
    type: "project.member_added",
    message:
      added.count > 0
        ? `added ${added.count} people from “${team.name}”`
        : `added nobody from “${team.name}” — all of them were already here`,
    userId: user.id,
    projectId,
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath(`/portal/${projectId}`);
}

export async function removeProjectMemberAction(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const user = await assertProjectEditor(projectId);
  const userId = String(formData.get("userId"));

  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true },
  });

  await prisma.projectMember.deleteMany({ where: { projectId, userId } });

  await logActivity({
    type: "project.member_removed",
    message: `took ${person?.name ?? "someone"} off the project`,
    userId: user.id,
    projectId,
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath(`/portal/${projectId}`);
}

export async function deleteProjectAction(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new Error("Only an administrator can delete projects");
  }

  const id = String(formData.get("id"));
  await prisma.project.delete({ where: { id } });

  revalidatePath("/projects");
  redirect("/projects");
}

/**
 * Whether this project's material may be sent to the model provider.
 *
 * Its own form rather than a line in the portal switches: those decide what
 * the client is shown, this decides what leaves the building. Recorded in the
 * activity feed either way, so the answer to "who allowed this" is in the
 * project's own history.
 */
export async function updateProjectAiAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const user = await assertProjectEditor(id);

  const allowed = formData.get("aiAllowed") === "on";

  await prisma.project.update({
    where: { id },
    data: { aiAllowed: allowed },
  });

  await logActivity({
    type: "project.ai_updated",
    message: allowed
      ? "allowed this project's material to be sent to the model provider"
      : "stopped this project's material being sent to the model provider",
    userId: user.id,
    projectId: id,
  });

  revalidatePath(`/projects/${id}`, "layout");
  return { ok: true };
}

/**
 * Closing a project, or opening it again.
 *
 * Only somebody who can configure may do this, and only on a project they can
 * already see — which `assertProjectEditor` settles, since a project you
 * cannot see is not a project you can name here.
 *
 * The one trap worth guarding: a manager who is not on the crew closing a
 * project would shut the door behind themselves and lose the very page they
 * are standing on. So closing it puts the person who closed it on the list.
 * They can take themselves off afterwards, deliberately, which is a different
 * act from doing it by accident.
 */
export async function updateProjectConfidentialAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const user = await assertProjectEditor(id);
  if (!canConfigure(user)) {
    return { error: "Only an administrator or a manager can close a project" };
  }

  const closed = formData.get("isConfidential") === "on";

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id },
      data: { isConfidential: closed },
    });

    if (closed) {
      await tx.projectAccess.upsert({
        where: { projectId_userId: { projectId: id, userId: user.id } },
        create: { projectId: id, userId: user.id, grantedById: user.id },
        update: {},
      });
    }
  });

  await logActivity({
    type: "project.confidential_updated",
    message: closed
      ? "closed this project: managers no longer see it unless they are on it or let in"
      : "opened this project to every manager again",
    userId: user.id,
    projectId: id,
  });

  revalidatePath(`/projects/${id}`, "layout");
  revalidatePath("/projects");
  return { ok: true };
}

/** Letting one more person see a closed project. */
export async function grantProjectAccessAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id"));
  const userId = String(formData.get("userId"));
  const user = await assertProjectEditor(id);
  if (!canConfigure(user)) throw new Error("You can't do that");

  const person = await prisma.user.findUnique({ where: { id: userId } });
  // Never a portal user: a client account has no place on the studio's side
  // of a project, closed or open.
  if (!person || !person.isActive || person.role === "CLIENT") {
    throw new Error("No such person");
  }

  await prisma.projectAccess.upsert({
    where: { projectId_userId: { projectId: id, userId } },
    create: { projectId: id, userId, grantedById: user.id },
    update: {},
  });

  await logActivity({
    type: "project.access_granted",
    message: `let ${person.name} into this project`,
    userId: user.id,
    projectId: id,
  });

  revalidatePath(`/projects/${id}`, "layout");
}

/** Taking somebody off the list again. */
export async function revokeProjectAccessAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id"));
  const userId = String(formData.get("userId"));
  const user = await assertProjectEditor(id);
  if (!canConfigure(user)) throw new Error("You can't do that");

  const person = await prisma.user.findUnique({ where: { id: userId } });

  await prisma.projectAccess.deleteMany({ where: { projectId: id, userId } });

  await logActivity({
    type: "project.access_revoked",
    message: `took ${person?.name ?? "someone"} off this project's list`,
    userId: user.id,
    projectId: id,
  });

  revalidatePath(`/projects/${id}`, "layout");
}

/**
 * Saving a project as a template.
 *
 * Deliberately captures what the job needed rather than where it got to: see
 * `lib/templates.ts` for what is left behind and why.
 */
export async function saveProjectAsTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("id"));
  const user = await assertProjectEditor(projectId);

  const name = String(formData.get("templateName") ?? "").trim();
  if (name.length < 2) return { error: "Give the template a name" };

  const clash = await prisma.projectTemplate.findUnique({ where: { name } });
  if (clash) return { error: "A template with that name already exists" };

  const result = await createTemplateFromProject({
    projectId,
    name,
    description: String(formData.get("templateDescription") ?? ""),
    authorId: user.id,
  });
  if (!result.ok) return { error: result.error };

  await logActivity({
    type: "project.saved_as_template",
    message: `saved this project as the template “${name}”`,
    userId: user.id,
    projectId,
  });

  revalidatePath("/templates");
  return { ok: true };
}

export async function deleteTemplateAction(formData: FormData) {
  const user = await requireUser();
  if (!canConfigure(user))
    throw new Error("You don't have permission to do that");

  await prisma.projectTemplate.delete({
    where: { id: String(formData.get("id")) },
  });
  revalidatePath("/templates");
}
