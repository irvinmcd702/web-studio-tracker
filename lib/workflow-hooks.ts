import { prisma } from "./db";
import { appUrl, sendToRocketChat } from "./rocketchat";
import { ticketKey } from "./utils";
import type { TransitionHooks } from "./workflow-rules";

/**
 * Runs the actions attached to an arrow after a ticket has moved.
 *
 * Every hook is best-effort and isolated: one failing hook must not undo the
 * move or stop the others, because the transition itself already happened.
 */
export type HookTarget = {
  ticketId: string;
  ticketNumber: number;
  ticketTitle: string;
  project: {
    id: string;
    key: string;
    name: string;
    rocketChatChannel: string | null;
  };
  fromStatus: string;
  toStatus: string;
  actor: { id: string; name: string };
};

export type HookOutcome = { hook: string; ok: boolean; error?: string };

export async function runTransitionHooks(
  hooks: TransitionHooks,
  target: HookTarget,
): Promise<HookOutcome[]> {
  const results: HookOutcome[] = [];

  const attempt = async (name: string, run: () => Promise<unknown>) => {
    try {
      await run();
      results.push({ hook: name, ok: true });
    } catch (e) {
      results.push({
        hook: name,
        ok: false,
        error: e instanceof Error ? e.message : "failed",
      });
    }
  };

  // Field updates are collected first so they land in a single write.
  const data: Record<string, unknown> = {};
  if (hooks.assignToActor) data.assigneeId = target.actor.id;
  if (hooks.clearAssignee) data.assigneeId = null;
  if (hooks.setPriority) data.priority = hooks.setPriority;
  if (hooks.setClientVisible !== null) {
    data.isClientVisible = hooks.setClientVisible;
  }

  if (Object.keys(data).length > 0) {
    await attempt("fields", () =>
      prisma.ticket.update({ where: { id: target.ticketId }, data }),
    );
  }

  if (hooks.postComment) {
    await attempt("comment", () =>
      prisma.ticketComment.create({
        data: {
          ticketId: target.ticketId,
          authorId: target.actor.id,
          body: hooks.postComment!,
        },
      }),
    );
  }

  if (hooks.notifyChat) {
    await attempt("chat", () =>
      sendToRocketChat({
        channel: target.project.rocketChatChannel,
        text: `*${target.fromStatus} → ${target.toStatus}* by ${target.actor.name}`,
        attachments: [
          {
            title: `${ticketKey(target.project.key, target.ticketNumber)} · ${target.ticketTitle}`,
            title_link: appUrl(`/tickets/${target.ticketId}`),
            color: "#7c3aed",
          },
        ],
      }),
    );
  }

  if (hooks.webhookUrl) {
    await attempt("webhook", async () => {
      const response = await fetch(hooks.webhookUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "ticket.transitioned",
          ticket: {
            id: target.ticketId,
            key: ticketKey(target.project.key, target.ticketNumber),
            title: target.ticketTitle,
            url: appUrl(`/tickets/${target.ticketId}`),
          },
          project: {
            id: target.project.id,
            key: target.project.key,
            name: target.project.name,
          },
          from: target.fromStatus,
          to: target.toStatus,
          actor: { id: target.actor.id, name: target.actor.name },
          at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`responded ${response.status}`);
      }
    });
  }

  return results;
}
