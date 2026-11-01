"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";
import { draft } from "@/lib/ai";
import { meetingPrompt } from "@/lib/ai-drafts";
import {
  parseSummary,
  prepareForModel,
  readTranscript,
  type MeetingSummary,
} from "@/lib/meetings";
import { insertTicket } from "@/lib/ticket-ops";
import type { ActionState } from "@/components/ui/form";

/**
 * Meetings.
 *
 * The transcript is stored as it arrived and the summary is stored beside it,
 * never in place of it. Reading a meeting is the model's job here; deciding
 * what the studio does about it stays a person's, which is why the actions it
 * finds arrive as a list of checkboxes rather than as tickets.
 */

async function assertMeetingEditor(projectId: string) {
  const user = await requireStaff();
  if (!canEditProject(user)) throw new Error("You can't do that");
  if (!(await canAccessProject(user, projectId))) {
    throw new Error("Project not found");
  }
  return user;
}

/** 5 MB of text is a very long meeting; beyond it something else is going on. */
const MAX_TRANSCRIPT = 5_000_000;

export async function createMeetingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const user = await assertMeetingEditor(projectId);

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2) return { error: "Give the meeting a title" };

  const file = formData.get("file");
  let raw = String(formData.get("transcript") ?? "");
  let source = "pasted";

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_TRANSCRIPT) {
      return { error: "That file is too large to be a transcript" };
    }
    raw = await file.text();
    source = file.name;
  }

  // Captions in, conversation out — see lib/meetings.ts. Anything that is not
  // a caption file passes through as written.
  const transcript = readTranscript(raw);
  if (transcript.length < 40) {
    return {
      error: "There is no transcript here — paste one or attach the file",
    };
  }

  const heldAtRaw = String(formData.get("heldAt") ?? "").trim();
  const heldAt = heldAtRaw ? new Date(heldAtRaw) : new Date();
  if (Number.isNaN(heldAt.getTime())) return { error: "That date is not one" };

  const meeting = await prisma.meeting.create({
    data: {
      projectId,
      title,
      heldAt,
      transcript,
      source,
      authorId: user.id,
    },
  });

  await logActivity({
    type: "meeting.added",
    message: `added the meeting "${title}"`,
    userId: user.id,
    projectId,
  });

  revalidatePath(`/projects/${projectId}/meetings`);
  redirect(`/projects/${projectId}/meetings/${meeting.id}`);
}

/**
 * Asking the model what the meeting was about.
 *
 * Separate from uploading on purpose: the transcript is kept whether or not
 * anybody ever wants it read, and sending a client's meeting to a third party
 * should be somebody pressing a button, not a side effect of filing it.
 */
export async function summariseMeetingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: { project: { select: { id: true, key: true, name: true } } },
  });
  if (!meeting) return { error: "Meeting not found" };

  const user = await assertMeetingEditor(meeting.projectId);
  const prepared = prepareForModel(meeting.transcript);

  const result = await draft({
    kind: "meeting_summary",
    projectId: meeting.projectId,
    userId: user.id,
    ...meetingPrompt({
      title: meeting.title,
      heldAt: meeting.heldAt,
      project: meeting.project,
      transcript: prepared.text,
      truncated: prepared.truncated,
    }),
    maxTokens: 1600,
  });

  if (!result.ok) return { error: result.message };

  const summary = parseSummary(result.text);
  if (!summary) {
    // Saving something we could not read would put invented structure on
    // screen beside real decisions.
    return {
      error: "The model did not answer in a shape this could read. Try again.",
    };
  }

  await prisma.meeting.update({
    where: { id },
    data: {
      summary,
      summarisedAt: new Date(),
      summaryPartial: prepared.truncated,
    },
  });

  revalidatePath(`/projects/${meeting.projectId}/meetings/${id}`);
  return { ok: true };
}

/**
 * Turning the actions somebody ticked into tickets.
 *
 * Goes through `createTicket` like every other route in, so the numbering,
 * the initial status and the activity trail are the same ones a hand-made
 * ticket gets. Nothing is assigned: the model heard a first name in a room,
 * which is not the same as knowing whose account that is.
 */
export async function createTicketsFromMeetingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");

  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return { error: "Meeting not found" };

  const user = await assertMeetingEditor(meeting.projectId);

  const summary = meeting.summary as MeetingSummary | null;
  const actions = summary?.actions ?? [];

  const picked = formData
    .getAll("action")
    .map((value) => Number(value))
    .filter((index) => Number.isInteger(index) && actions[index] !== undefined);

  if (picked.length === 0) return { error: "Tick the ones worth doing first" };

  const project = await prisma.project.findUnique({
    where: { id: meeting.projectId },
    include: {
      workflow: { include: { statuses: { orderBy: { position: "asc" } } } },
    },
  });
  const status =
    project?.workflow.statuses.find((s) => s.isInitial) ??
    project?.workflow.statuses[0];
  if (!status) {
    return { error: "The project workflow has no statuses — add one first" };
  }

  for (const index of picked) {
    const action = actions[index]!;
    const ticket = await insertTicket({
      projectId: meeting.projectId,
      statusId: status.id,
      title: action.what.slice(0, 200),
      // The provenance goes in the description as words, not only as a
      // foreign key: whoever opens this in six months is reading, not
      // querying. Nothing is assigned — a first name heard in a room is not
      // an account.
      description: [
        `From the meeting “${meeting.title}”.`,
        action.who ? `Named in the room: ${action.who}.` : null,
        action.when ? `Said about timing: ${action.when}.` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      reporterId: user.id,
      meetingId: meeting.id,
    });

    await logActivity({
      type: "ticket.created",
      message: `created ${project!.key}-${ticket.number} from a meeting: ${ticket.title}`,
      userId: user.id,
      projectId: meeting.projectId,
      ticketId: ticket.id,
    });
  }

  await logActivity({
    type: "meeting.tickets_created",
    message: `made ${picked.length} ticket(s) from "${meeting.title}"`,
    userId: user.id,
    projectId: meeting.projectId,
  });

  revalidatePath(`/projects/${meeting.projectId}`, "layout");
  return { ok: true };
}

export async function deleteMeetingAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");

  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return;

  const user = await assertMeetingEditor(meeting.projectId);

  // Tickets made from it survive — see the migration for why.
  await prisma.meeting.delete({ where: { id } });

  await logActivity({
    type: "meeting.deleted",
    message: `deleted the meeting "${meeting.title}"`,
    userId: user.id,
    projectId: meeting.projectId,
  });

  redirect(`/projects/${meeting.projectId}/meetings`);
}
