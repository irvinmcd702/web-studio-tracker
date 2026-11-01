"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import type { ActionState } from "@/components/ui/form";

async function assertConfigurer() {
  const user = await requireUser();
  if (!canConfigure(user))
    throw new Error("You don't have permission to do that");
  return user;
}

const teamSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
  description: z.string().max(400).optional().nullable(),
  color: z.string().max(9),
});

export async function createTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertConfigurer();

  const parsed = teamSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    color: String(formData.get("color") ?? "#0ea5e9"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const exists = await prisma.team.findUnique({
    where: { name: parsed.data.name },
  });
  if (exists) return { error: "A team with this name already exists" };

  const team = await prisma.team.create({ data: parsed.data });

  const memberIds = formData.getAll("memberIds").map(String).filter(Boolean);
  if (memberIds.length) {
    await prisma.teamMember.createMany({
      data: memberIds.map((userId) => ({ teamId: team.id, userId })),
      skipDuplicates: true,
    });
  }

  revalidatePath("/teams");
  redirect(`/teams/${team.id}`);
}

export async function updateTeamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertConfigurer();
  const id = String(formData.get("id"));

  const parsed = teamSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    color: String(formData.get("color") ?? "#0ea5e9"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const duplicate = await prisma.team.findFirst({
    where: { name: parsed.data.name, NOT: { id } },
  });
  if (duplicate) return { error: "A team with this name already exists" };

  await prisma.team.update({ where: { id }, data: parsed.data });

  revalidatePath(`/teams/${id}`);
  revalidatePath("/teams");
  return { ok: true };
}

export async function addTeamMemberAction(formData: FormData) {
  await assertConfigurer();
  const teamId = String(formData.get("teamId"));
  const userId = String(formData.get("userId"));
  const title = String(formData.get("title") ?? "").trim() || null;
  if (!userId) return;

  await prisma.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId, title },
    update: { title },
  });

  revalidatePath(`/teams/${teamId}`);
}

export async function removeTeamMemberAction(formData: FormData) {
  await assertConfigurer();
  const teamId = String(formData.get("teamId"));
  const userId = String(formData.get("userId"));

  await prisma.teamMember.deleteMany({ where: { teamId, userId } });
  revalidatePath(`/teams/${teamId}`);
}

export async function deleteTeamAction(formData: FormData) {
  await assertConfigurer();
  const id = String(formData.get("id"));

  // Safe to delete outright: a team is a label on people, not project access.
  // Whoever it contained stays on every project crew they were picked for.
  await prisma.team.delete({ where: { id } });
  revalidatePath("/teams");
  redirect("/teams");
}
