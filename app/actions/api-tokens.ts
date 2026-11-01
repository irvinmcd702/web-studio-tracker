"use server";

import { revalidatePath } from "next/cache";
import type { ApiScope } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { issueApiToken } from "@/lib/api-tokens";
import { logActivity } from "@/lib/activity";
import type { ActionState } from "@/components/ui/form";

type TokenState =
  | (NonNullable<ActionState> & { token?: string; name?: string })
  | null;

/**
 * Tokens belong to the person who creates them and act as that person. There
 * is deliberately no way to mint a token for somebody else: an agent's reach
 * is always somebody's own reach, and the person who gave it is on the record.
 */
export async function createApiTokenAction(
  _prev: TokenState,
  formData: FormData,
): Promise<TokenState> {
  const user = await requireStaff();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2)
    return { error: "Give the token a name you'll recognise" };

  const kind = formData.get("kind") === "PERSONAL" ? "PERSONAL" : "AGENT";
  const scopes: ApiScope[] =
    formData.get("write") === "on" ? ["READ", "WRITE"] : ["READ"];

  const days = Number(formData.get("expiresInDays") ?? 0);
  const expiresAt =
    Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      : null;

  const { token } = await issueApiToken({
    userId: user.id,
    name,
    kind,
    scopes,
    expiresAt,
  });

  await logActivity({
    type: "api_token.created",
    message: `issued the API token “${name}” (${scopes.join("+")})`,
    userId: user.id,
  });

  revalidatePath("/tokens");
  return { ok: true, token, name };
}

export async function revokeApiTokenAction(formData: FormData) {
  const user = await requireStaff();
  const id = String(formData.get("id"));

  const token = await prisma.apiToken.findUnique({ where: { id } });
  // Own tokens only; an admin revoking somebody else's would hide who did it.
  if (!token || token.userId !== user.id) return;

  await prisma.apiToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  await logActivity({
    type: "api_token.revoked",
    message: `revoked the API token “${token.name}”`,
    userId: user.id,
  });

  revalidatePath("/tokens");
}
