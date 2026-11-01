"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { deleteUpload, saveUpload } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/ui/form";

export async function uploadAttachmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();

  const projectId = String(formData.get("projectId") ?? "") || null;
  const ticketId = String(formData.get("ticketId") ?? "") || null;
  const approvalId = String(formData.get("approvalId") ?? "") || null;

  let resolvedProjectId = projectId;
  if (!resolvedProjectId && ticketId) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { projectId: true },
    });
    resolvedProjectId = ticket?.projectId ?? null;
  }
  if (!resolvedProjectId && approvalId) {
    const approval = await prisma.approval.findUnique({
      where: { id: approvalId },
      select: { projectId: true },
    });
    resolvedProjectId = approval?.projectId ?? null;
  }

  if (!resolvedProjectId) return { error: "No project specified" };
  if (!(await canAccessProject(user, resolvedProjectId))) {
    return { error: "Project is not accessible" };
  }

  // Client uploads can be switched off per project.
  if (user.role === "CLIENT") {
    const project = await prisma.project.findUnique({
      where: { id: resolvedProjectId },
      select: { portalShowFiles: true, portalAllowUploads: true },
    });
    if (!project?.portalShowFiles || !project.portalAllowUploads) {
      return { error: "Uploads are disabled for this project" };
    }
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!files.length) return { error: "Choose a file" };

  // Clients upload through the portal; their files are always visible to them.
  const isClientVisible =
    user.role === "CLIENT" || formData.get("isClientVisible") === "on";

  for (const file of files) {
    let stored;
    try {
      stored = await saveUpload(file);
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Couldn't save the file",
      };
    }

    await prisma.attachment.create({
      data: {
        ...stored,
        uploadedById: user.id,
        projectId: resolvedProjectId,
        ticketId,
        approvalId,
        // A file the client is asked to sign off on is visible by definition.
        isClientVisible: approvalId ? true : isClientVisible,
      },
    });
  }

  await logActivity({
    type: "file.uploaded",
    message:
      files.length === 1
        ? `uploaded ${files[0]!.name}`
        : `uploaded ${files.length} files`,
    userId: user.id,
    projectId: resolvedProjectId,
    ticketId,
  });

  revalidatePath(`/projects/${resolvedProjectId}`, "layout");
  if (ticketId) revalidatePath(`/tickets/${ticketId}`);
  revalidatePath(`/portal/${resolvedProjectId}`);
  return { ok: true };
  // (approval pages live under the project layout, already revalidated above)
}

export async function uploadRequestAttachmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (user.role === "CLIENT")
    return { error: "You don't have permission to do that" };

  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { error: "No request specified" };

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose a file" };

  for (const file of files) {
    let stored;
    try {
      stored = await saveUpload(file);
    } catch (e) {
      return {
        error: e instanceof Error ? e.message : "Couldn't save the file",
      };
    }
    await prisma.attachment.create({
      data: { ...stored, uploadedById: user.id, requestId },
    });
  }

  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

export async function deleteAttachmentAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));

  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return;

  const isOwner = attachment.uploadedById === user.id;
  const isPrivileged = user.role === "ADMIN" || user.role === "MANAGER";
  if (!isOwner && !isPrivileged) {
    throw new Error("You can only delete your own files");
  }

  if (
    attachment.projectId &&
    !(await canAccessProject(user, attachment.projectId))
  ) {
    throw new Error("Project is not accessible");
  }

  await prisma.attachment.delete({ where: { id } });
  await deleteUpload(attachment.fileName);

  if (attachment.projectId) {
    revalidatePath(`/projects/${attachment.projectId}`, "layout");
    revalidatePath(`/portal/${attachment.projectId}`);
  }
  if (attachment.ticketId) revalidatePath(`/tickets/${attachment.ticketId}`);
  if (attachment.requestId) revalidatePath(`/requests/${attachment.requestId}`);
}

export async function toggleAttachmentVisibilityAction(formData: FormData) {
  const user = await requireUser();
  if (user.role === "CLIENT")
    throw new Error("You don't have permission to do that");

  const id = String(formData.get("id"));
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return;

  await prisma.attachment.update({
    where: { id },
    data: { isClientVisible: !attachment.isClientVisible },
  });

  if (attachment.projectId) {
    revalidatePath(`/projects/${attachment.projectId}`, "layout");
  }
  if (attachment.ticketId) revalidatePath(`/tickets/${attachment.ticketId}`);
}
