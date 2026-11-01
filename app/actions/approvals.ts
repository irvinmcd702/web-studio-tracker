"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { approvalDecisionError } from "@/lib/approvals";
import { notifyApprovalDecision } from "@/lib/notify";
import type { ActionState } from "@/components/ui/form";

async function assertStaffOnProject(projectId: string) {
  const user = await requireUser();
  if (!canEditProject(user))
    throw new Error("You don't have permission to do that");
  if (!(await canAccessProject(user, projectId))) {
    throw new Error("Project is not accessible");
  }
  return user;
}

function optionalNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function optionalDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return raw ? new Date(raw) : null;
}

const approvalSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(160),
  description: z.string().max(4000).optional().nullable(),
});

function revalidateBoth(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath(`/portal/${projectId}`);
}

export async function createApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId"));
  const user = await assertStaffOnProject(projectId);

  const parsed = approvalSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const count = await prisma.approval.count({ where: { projectId } });

  await prisma.approval.create({
    data: {
      projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      amount: optionalNumber(formData.get("amount")),
      dueDate: optionalDate(formData.get("dueDate")),
      position: count,
      // "Send now" skips the draft step for the common case.
      ...(formData.get("sendNow") === "on"
        ? {
            status: "PENDING" as const,
            requestedById: user.id,
            requestedAt: new Date(),
          }
        : {}),
    },
  });

  await logActivity({
    type: "approval.created",
    message: `added the “${parsed.data.title}” stage for approval`,
    userId: user.id,
    projectId,
  });

  revalidateBoth(projectId);
  return { ok: true };
}

export async function updateApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id"));
  const approval = await prisma.approval.findUnique({ where: { id } });
  if (!approval) return { error: "Stage not found" };

  await assertStaffOnProject(approval.projectId);

  const parsed = approvalSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  await prisma.approval.update({
    where: { id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      amount: optionalNumber(formData.get("amount")),
      dueDate: optionalDate(formData.get("dueDate")),
    },
  });

  revalidateBoth(approval.projectId);
  return { ok: true };
}

/** Draft → pending, and re-sending after the client asked for changes. */
export async function sendApprovalAction(formData: FormData) {
  const id = String(formData.get("id"));
  const approval = await prisma.approval.findUnique({ where: { id } });
  if (!approval) return;

  const user = await assertStaffOnProject(approval.projectId);
  if (approval.status === "APPROVED") {
    throw new Error("This stage is already approved");
  }

  await prisma.approval.update({
    where: { id },
    data: {
      status: "PENDING",
      requestedById: user.id,
      requestedAt: new Date(),
      // A resubmission starts a clean decision.
      decidedById: null,
      decidedAt: null,
      decisionNote: null,
    },
  });

  await logActivity({
    type: "approval.sent",
    message: `sent “${approval.title}” to the client for approval`,
    userId: user.id,
    projectId: approval.projectId,
  });

  revalidateBoth(approval.projectId);
}

export async function withdrawApprovalAction(formData: FormData) {
  const id = String(formData.get("id"));
  const approval = await prisma.approval.findUnique({ where: { id } });
  if (!approval) return;

  const user = await assertStaffOnProject(approval.projectId);

  await prisma.approval.update({
    where: { id },
    data: {
      status: "DRAFT",
      requestedById: null,
      requestedAt: null,
      decidedById: null,
      decidedAt: null,
      decisionNote: null,
    },
  });

  await logActivity({
    type: "approval.withdrawn",
    message: `pulled “${approval.title}” back to draft`,
    userId: user.id,
    projectId: approval.projectId,
  });

  revalidateBoth(approval.projectId);
}

/**
 * Records the decision. The client does this from the portal; studio staff can
 * do it too, for a sign-off that arrived by phone or email — either way the
 * decision is attributed to whoever pressed the button.
 */
export async function decideApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision"));

  if (decision !== "APPROVED" && decision !== "CHANGES_REQUESTED") {
    return { error: "Unknown decision" };
  }

  const approval = await prisma.approval.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          id: true,
          key: true,
          name: true,
          rocketChatChannel: true,
          portalShowApprovals: true,
        },
      },
    },
  });
  if (!approval) return { error: "Stage not found" };

  if (!(await canAccessProject(user, approval.projectId))) {
    return { error: "Project is not accessible" };
  }

  // A client may only act on what the portal actually offers them.
  const denied = approvalDecisionError(user, approval);
  if (denied) return { error: denied };

  const note = String(formData.get("decisionNote") ?? "").trim() || null;
  if (decision === "CHANGES_REQUESTED" && !note) {
    return { error: "Describe what needs changing" };
  }

  await prisma.approval.update({
    where: { id },
    data: {
      status: decision,
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });

  await logActivity({
    type:
      decision === "APPROVED"
        ? "approval.approved"
        : "approval.changes_requested",
    message:
      decision === "APPROVED"
        ? `approved “${approval.title}”`
        : `requested changes on “${approval.title}”`,
    userId: user.id,
    projectId: approval.projectId,
  });

  await notifyApprovalDecision({
    project: approval.project,
    title: approval.title,
    approved: decision === "APPROVED",
    deciderName: user.name,
    isClient: user.role === "CLIENT",
    note,
  });

  revalidateBoth(approval.projectId);
  return { ok: true };
}

export async function deleteApprovalAction(formData: FormData) {
  const id = String(formData.get("id"));
  const approval = await prisma.approval.findUnique({ where: { id } });
  if (!approval) return;

  const user = await assertStaffOnProject(approval.projectId);
  if (approval.status === "APPROVED" && user.role !== "ADMIN") {
    throw new Error(
      "An approved stage can only be deleted by an administrator",
    );
  }

  await prisma.approval.delete({ where: { id } });
  revalidateBoth(approval.projectId);
}
