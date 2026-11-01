"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { canReadDoc, canWriteDocs } from "@/lib/docs";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/ui/form";

const docSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters").max(200),
  body: z.string().max(200_000),
});

async function assertWriter() {
  const user = await requireUser();
  if (!canWriteDocs(user))
    throw new Error("You don't have permission to do that");
  return user;
}

function revalidateDoc(docId: string, projectId: string | null) {
  revalidatePath("/docs");
  revalidatePath(`/docs/${docId}`);
  if (projectId) {
    revalidatePath(`/projects/${projectId}`, "layout");
    revalidatePath(`/portal/${projectId}`);
  }
}

export async function createDocAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertWriter();

  const parsed = docSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const projectId = String(formData.get("projectId") ?? "") || null;
  if (projectId && !(await canAccessProject(user, projectId))) {
    return { error: "Project is not accessible" };
  }

  const doc = await prisma.doc.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      projectId,
      isClientVisible: formData.get("isClientVisible") === "on",
      createdById: user.id,
      updatedById: user.id,
    },
  });

  if (projectId) {
    await logActivity({
      type: "doc.created",
      message: `added the doc “${doc.title}”`,
      userId: user.id,
      projectId,
    });
  }

  revalidateDoc(doc.id, projectId);
  redirect(`/docs/${doc.id}`);
}

export async function updateDocAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertWriter();
  const id = String(formData.get("id"));

  const existing = await prisma.doc.findUnique({ where: { id } });
  if (!existing) return { error: "Doc not found" };
  if (!(await canReadDoc(user, id))) return { error: "Doc is not accessible" };

  const parsed = docSchema.safeParse({
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  await prisma.doc.update({
    where: { id },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      isClientVisible: formData.get("isClientVisible") === "on",
      updatedById: user.id,
    },
  });

  revalidateDoc(id, existing.projectId);
  return { ok: true };
}

export async function toggleDocSharingAction(formData: FormData) {
  const user = await assertWriter();
  const id = String(formData.get("id"));

  const doc = await prisma.doc.findUnique({ where: { id } });
  if (!doc) return;
  if (!(await canReadDoc(user, id))) throw new Error("Doc is not accessible");

  await prisma.doc.update({
    where: { id },
    data: { isClientVisible: !doc.isClientVisible, updatedById: user.id },
  });

  revalidateDoc(id, doc.projectId);
}

export async function deleteDocAction(formData: FormData) {
  const user = await assertWriter();
  const id = String(formData.get("id"));

  const doc = await prisma.doc.findUnique({ where: { id } });
  if (!doc) return;
  if (!(await canReadDoc(user, id))) throw new Error("Doc is not accessible");

  // Authors clean up after themselves; otherwise it takes a manager.
  const privileged = user.role === "ADMIN" || user.role === "MANAGER";
  if (doc.createdById !== user.id && !privileged) {
    throw new Error(
      "Only the author, an admin or a manager can delete this doc",
    );
  }

  await prisma.doc.delete({ where: { id } });

  revalidateDoc(id, doc.projectId);
  redirect(doc.projectId ? `/projects/${doc.projectId}/docs` : "/docs");
}
