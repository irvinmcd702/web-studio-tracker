import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getStudioSettings } from "@/lib/settings";
import { logActivity } from "@/lib/activity";
import { TicketOpError, commentOnTicket, moveTicket } from "@/lib/ticket-ops";
import { parseTicketKey } from "@/lib/api-serialise";
import {
  deliveryId,
  detectProvider,
  readGitHubEvent,
  readGitLabEvent,
  verifyGitHubSignature,
  verifyGitLabToken,
  type GitIntent,
} from "@/lib/git-events";

/**
 * `POST /api/git/webhook` — the forge tells the tracker what happened.
 *
 * A branch or a pull request that names a ticket (`ACME-14`) leaves a comment
 * with the link on that ticket and, if the studio configured it, moves it.
 *
 * Two things are deliberate. The event acts as the **person who pushed**, found
 * by their commit email or their forge login, so the workflow's conditions apply to them exactly as
 * in the browser: a developer whose release transition is admin-only still
 * cannot release by merging. And when nobody matches, the tracker
 * comments but does not move anything — a stranger's push is news, not
 * authority.
 */

const OK = (body: object) =>
  Response.json(body, { headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const settings = await getStudioSettings();

  if (!settings.gitEnabled || !settings.gitSecret) {
    return Response.json(
      { error: "disabled", message: "Git events are switched off in settings" },
      { status: 404 },
    );
  }

  const provider = detectProvider(request.headers);
  if (!provider) {
    return Response.json(
      {
        error: "unknown_provider",
        message: "Expected a GitHub or GitLab webhook",
      },
      { status: 400 },
    );
  }

  const raw = await request.text();

  const authentic =
    provider === "github"
      ? verifyGitHubSignature(
          raw,
          request.headers.get("x-hub-signature-256"),
          settings.gitSecret,
        )
      : verifyGitLabToken(
          request.headers.get("x-gitlab-token"),
          settings.gitSecret,
        );

  if (!authentic) {
    return Response.json(
      {
        error: "bad_signature",
        message: "Signature does not match the secret",
      },
      { status: 401 },
    );
  }

  // A signed payload stays valid forever, so the same capture could be sent
  // twice and comment (and move) the ticket twice. Deliveries are remembered
  // for a week, well past any forge's retry window.
  const delivery = deliveryId(request.headers, raw);
  const seen = await prisma.webhookDelivery.findUnique({
    where: { id: delivery },
  });

  if (seen) {
    return OK({ handled: false, reason: "already processed this delivery" });
  }

  await prisma.webhookDelivery.create({ data: { id: delivery } });

  // Housekeeping, cheap and only on a real delivery.
  await prisma.webhookDelivery.deleteMany({
    where: {
      receivedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json(
      { error: "bad_json", message: "Body is not JSON" },
      { status: 400 },
    );
  }

  const intent =
    provider === "github"
      ? readGitHubEvent(request.headers.get("x-github-event") ?? "", payload)
      : readGitLabEvent(payload);

  if (!intent) {
    // Not an error: most events simply don't mention a ticket.
    return OK({ handled: false, reason: "no ticket key in this event" });
  }

  const results = await Promise.all(
    intent.keys.map((key) => apply(intent, key, settings)),
  );

  await prisma.studioSettings.update({
    where: { id: "default" },
    data: {
      gitLastEventAt: new Date(),
      gitLastEventInfo: `${intent.kind}: ${intent.keys.join(", ")} — ${results
        .map((r) => r.outcome)
        .join("; ")}`,
    },
  });

  return OK({ handled: true, kind: intent.kind, results });
}

type Settings = Awaited<ReturnType<typeof getStudioSettings>>;

async function apply(intent: GitIntent, key: string, settings: Settings) {
  const parsed = parseTicketKey(key);
  if (!parsed) return { key, outcome: "unreadable key" };

  const ticket = await prisma.ticket.findFirst({
    where: {
      project: { key: { equals: parsed.projectKey, mode: "insensitive" } },
      number: parsed.number,
    },
    include: {
      project: {
        include: {
          workflow: { include: { statuses: true } },
          manager: true,
        },
      },
    },
  });

  if (!ticket) return { key, outcome: "no such ticket" };

  // Who did it, as far as we can tell. Falling back to the project manager
  // keeps the comment attributable to a real person; the text still names the
  // pusher, and an unmatched pusher never gets to move anything.
  // GitHub sends an email on pushes and only a login on pull requests, so we
  // try both. The login lives on the person's profile in People.
  const identifiers = [
    intent.authorEmail
      ? { email: { equals: intent.authorEmail, mode: "insensitive" as const } }
      : null,
    intent.authorLogin
      ? {
          gitLogin: {
            equals: intent.authorLogin,
            mode: "insensitive" as const,
          },
        }
      : null,
  ].filter(Boolean) as object[];

  const pusher = identifiers.length
    ? await prisma.user.findFirst({
        where: {
          OR: identifiers,
          isActive: true,
          role: { in: ["ADMIN", "MANAGER", "MEMBER"] },
        },
      })
    : null;

  const author = pusher ?? ticket.project.manager;
  if (!author) return { key, outcome: "nobody to attribute this to" };

  const who = intent.authorName ?? intent.authorEmail ?? "someone";
  const body = [
    intent.summary,
    intent.url ? `\n${intent.url}` : "",
    `\n— ${pusher ? "from git" : `pushed by ${who}, reported by git`}`,
  ].join("");

  try {
    await commentOnTicket({ ticketId: ticket.id, body, actor: author });
  } catch (e) {
    return {
      key,
      outcome: `comment refused: ${e instanceof TicketOpError ? e.message : "error"}`,
    };
  }

  const wantedName =
    intent.kind === "opened"
      ? settings.gitStatusOnOpen
      : intent.kind === "merged"
        ? settings.gitStatusOnMerge
        : null;

  if (!wantedName) return { key, outcome: "commented" };

  if (!pusher) {
    return {
      key,
      outcome:
        "commented; not moved because the pusher is not a studio account",
    };
  }

  const target = ticket.project.workflow.statuses.find(
    (s) => s.name.toLowerCase() === wantedName.trim().toLowerCase(),
  );

  if (!target) {
    return {
      key,
      outcome: `commented; this project's workflow has no "${wantedName}" status`,
    };
  }

  if (target.id === ticket.statusId) {
    return { key, outcome: `commented; already in ${target.name}` };
  }

  try {
    const moved = await moveTicket({
      ticketId: ticket.id,
      toStatusId: target.id,
      actor: pusher,
    });

    revalidatePath(`/tickets/${ticket.id}`);
    revalidatePath(`/projects/${ticket.projectId}`, "layout");

    return { key, outcome: `commented; moved ${moved.from} → ${moved.to}` };
  } catch (e) {
    // A refusal is worth recording: the studio decided this move needs a human.
    const message = e instanceof TicketOpError ? e.message : "move failed";

    await logActivity({
      type: "git.move_refused",
      message: `git event did not move the ticket: ${message}`,
      userId: pusher.id,
      projectId: ticket.projectId,
      ticketId: ticket.id,
    });

    return { key, outcome: `commented; not moved: ${message}` };
  }
}
