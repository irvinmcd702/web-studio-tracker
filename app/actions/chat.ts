"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { notifyClientMessage } from "@/lib/notify";
import { recordMentions } from "@/lib/mentions";
import type { ActionState } from "@/components/ui/form";

export async function sendChatMessageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const body = String(formData.get("body") ?? "").trim();

  if (!body) return { error: "Message is empty" };
  if (body.length > 4000) return { error: "Message is too long" };

  if (!(await canAccessProject(user, projectId))) {
    return { error: "Project is not accessible" };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      key: true,
      name: true,
      portalShowChat: true,
      rocketChatChannel: true,
    },
  });
  if (!project) return { error: "Project not found" };

  // The portal chat can be switched off per project — enforce it here too, not
  // just by hiding the composer.
  if (user.role === "CLIENT" && !project.portalShowChat) {
    return { error: "Chat is disabled for this project" };
  }

  // Only staff may post internal notes.
  const isInternal =
    user.role !== "CLIENT" && formData.get("isInternal") === "on";

  await prisma.chatMessage.create({
    data: { projectId, authorId: user.id, body, isInternal },
  });

  // A client can name somebody at the studio too — that is the point of a
  // shared thread. Who is reachable is decided by project access, not by who
  // is writing.
  await recordMentions({ body, projectId, authorId: user.id });

  // Only the client writing to the studio is worth a chat ping.
  if (user.role === "CLIENT") {
    await notifyClientMessage({
      project,
      authorName: user.name,
      body,
    });
  }

  revalidatePath(`/projects/${projectId}/chat`);
  revalidatePath(`/portal/${projectId}`);
  return { ok: true };
}

export async function markChatReadAction(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));

  if (!(await canAccessProject(user, projectId))) return;

  await prisma.chatMessage.updateMany({
    where: {
      projectId,
      readAt: null,
      NOT: { authorId: user.id },
      ...(user.role === "CLIENT" ? { isInternal: false } : {}),
    },
    data: { readAt: new Date() },
  });

  revalidatePath(`/projects/${projectId}/chat`);
}

export async function deleteChatMessageAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));

  const message = await prisma.chatMessage.findUnique({ where: { id } });
  if (!message) return;

  if (message.authorId !== user.id && user.role !== "ADMIN") {
    throw new Error("You can only delete your own messages");
  }

  await prisma.chatMessage.delete({ where: { id } });
  revalidatePath(`/projects/${message.projectId}/chat`);
  revalidatePath(`/portal/${message.projectId}`);
}
