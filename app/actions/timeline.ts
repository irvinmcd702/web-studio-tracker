"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaff } from "@/lib/auth";
import { recordTimeline } from "@/lib/timeline";
import type { ActionState } from "@/components/ui/form";

const noteSchema = z.object({
  summary: z.string().min(2, "Write a line or two").max(2000),
});

/**
 * A note somebody typed against a client or a request.
 *
 * Any staff member may write one. Clients cannot: `requireStaff` refuses them,
 * and this is the studio's own record of a relationship rather than anything
 * the other side takes part in.
 *
 * There is no companion edit or delete action, and that is the feature. What
 * the form offers is a way to add a line, so the only way to correct one is to
 * add another saying so.
 */
export async function addTimelineNoteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireStaff();

  const clientId = String(formData.get("clientId") ?? "") || null;
  const requestId = String(formData.get("requestId") ?? "") || null;
  if (!clientId && !requestId) return { error: "Nothing to attach this to" };

  const parsed = noteSchema.safeParse({
    summary: String(formData.get("summary") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  await recordTimeline({
    kind: "NOTE",
    summary: parsed.data.summary,
    actorKind: "HUMAN",
    userId: user.id,
    clientId,
    requestId,
  });

  if (clientId) revalidatePath(`/clients/${clientId}`);
  if (requestId) revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}
