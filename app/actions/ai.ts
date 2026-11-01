"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { draft } from "@/lib/ai";
import {
  acceptancePrompt,
  chatSummaryPrompt,
  requestDraftPrompt,
} from "@/lib/ai-drafts";
import { logActivity } from "@/lib/activity";

/**
 * Every one of these returns text for a person to read. None of them writes
 * anything anywhere — saving is a second, separate action that a human
 * triggers, and that is the whole point of the feature.
 */
export type AiDraftState = {
  error?: string;
  ok?: boolean;
  text?: string;
  /** What it cost, shown next to the draft rather than hidden in a log. */
  note?: string;
} | null;

function spendNote(usage: {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}) {
  const tokens = `${usage.promptTokens + usage.completionTokens} tokens`;
  return usage.costUsd != null
    ? `${tokens} · $${usage.costUsd.toFixed(4)}`
    : tokens;
}

export async function draftAcceptanceAction(
  _prev: AiDraftState,
  formData: FormData,
): Promise<AiDraftState> {
  const user = await requireStaff();
  const ticketId = String(formData.get("ticketId") ?? "");

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      number: true,
      title: true,
      description: true,
      type: true,
      projectId: true,
      project: { select: { key: true, name: true, description: true } },
    },
  });
  if (!ticket) return { error: "Ticket not found" };
  if (!(await canAccessProject(user, ticket.projectId))) {
    return { error: "Ticket not found" };
  }
  if (!canEditProject(user)) {
    return { error: "You don't have permission to do that" };
  }

  const result = await draft({
    kind: "acceptance",
    projectId: ticket.projectId,
    userId: user.id,
    ...acceptancePrompt(ticket),
    maxTokens: 600,
  });

  return result.ok
    ? { ok: true, text: result.text, note: spendNote(result.usage) }
    : { error: result.message };
}

/** The second half: a person read the draft and chose to keep it. */
export async function saveAcceptanceAction(
  _prev: AiDraftState,
  formData: FormData,
): Promise<AiDraftState> {
  const user = await requireStaff();
  if (!canEditProject(user)) {
    return { error: "You don't have permission to do that" };
  }

  const ticketId = String(formData.get("ticketId") ?? "");
  const acceptance = String(formData.get("acceptance") ?? "").trim();

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, projectId: true, number: true },
  });
  if (!ticket) return { error: "Ticket not found" };
  if (!(await canAccessProject(user, ticket.projectId))) {
    return { error: "Ticket not found" };
  }

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { acceptance: acceptance || null },
  });

  // Recorded as the person's edit, because it is: they read it and kept it.
  await logActivity({
    type: "ticket.acceptance_written",
    message: "wrote the acceptance criteria",
    projectId: ticket.projectId,
    ticketId: ticket.id,
    userId: user.id,
  });

  revalidatePath(`/tickets/${ticket.id}`);
  return { ok: true };
}

export async function summariseChatAction(
  _prev: AiDraftState,
  formData: FormData,
): Promise<AiDraftState> {
  const user = await requireStaff();
  const projectId = String(formData.get("projectId") ?? "");

  if (!(await canAccessProject(user, projectId))) {
    return { error: "Project not found" };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, client: { select: { name: true } } },
  });
  if (!project) return { error: "Project not found" };

  const messages = await prisma.chatMessage.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    // A thread long enough to need summarising is a thread whose oldest
    // messages no longer matter; the recent end is what a catch-up is about.
    take: 120,
    select: {
      createdAt: true,
      body: true,
      isInternal: true,
      author: { select: { name: true, role: true } },
    },
  });

  if (messages.length < 3) {
    return { error: "There is barely a conversation here yet — just read it" };
  }

  const result = await draft({
    kind: "chat_summary",
    projectId,
    userId: user.id,
    ...chatSummaryPrompt({
      projectName: project.name,
      clientName: project.client?.name ?? null,
      messages: messages.map((m) => ({
        authorName: m.author.name,
        isClient: m.author.role === "CLIENT",
        isInternal: m.isInternal,
        createdAt: m.createdAt,
        body: m.body,
      })),
    }),
    maxTokens: 800,
  });

  return result.ok
    ? { ok: true, text: result.text, note: spendNote(result.usage) }
    : { error: result.message };
}

export async function draftFromRequestAction(
  _prev: AiDraftState,
  formData: FormData,
): Promise<AiDraftState> {
  const user = await requireStaff();
  if (!canEditProject(user)) {
    return { error: "You don't have permission to do that" };
  }

  const request = await prisma.clientRequest.findUnique({
    where: { id: String(formData.get("requestId") ?? "") },
    select: {
      title: true,
      description: true,
      companyName: true,
      budgetNote: true,
      source: true,
      projectId: true,
    },
  });
  if (!request) return { error: "Request not found" };

  const result = await draft({
    kind: "request_draft",
    // A converted request belongs to its project and follows that project's
    // answer; one that isn't converted yet has only the studio default.
    projectId: request.projectId,
    userId: user.id,
    ...requestDraftPrompt(request),
    maxTokens: 1000,
  });

  return result.ok
    ? { ok: true, text: result.text, note: spendNote(result.usage) }
    : { error: result.message };
}
