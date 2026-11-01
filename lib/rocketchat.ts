import { prisma } from "./db";
import { getStudioSettings } from "./settings";

/**
 * Rocket.Chat integration — outgoing only.
 *
 * We post to an incoming webhook, which is the cheapest thing to set up on the
 * Rocket.Chat side: no admin rights, no bot user, one URL. The `channel` field
 * lets a single webhook fan out to per-project channels.
 *
 * Delivery never blocks or breaks the user's action: every failure is swallowed
 * and recorded on the settings row so the UI can show the last result.
 */

const TIMEOUT_MS = 5000;

export type RocketChatField = {
  title: string;
  value: string;
  short?: boolean;
};

export type RocketChatAttachment = {
  title?: string;
  title_link?: string;
  text?: string;
  color?: string;
  fields?: RocketChatField[];
};

export type RocketChatMessage = {
  /** Channel override, e.g. "#acme-store". Omit to use the webhook's default. */
  channel?: string | null;
  text: string;
  attachments?: RocketChatAttachment[];
};

export type DeliveryResult = { ok: true } | { ok: false; error: string };

export function appUrl(path = "") {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}${path}`;
}

function isUsableWebhookUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Normalises "acme-store", "#acme-store" and "  " into "#acme-store" / null. */
export function normaliseChannel(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  return raw.startsWith("#") || raw.startsWith("@") ? raw : `#${raw}`;
}

async function recordResult(result: DeliveryResult) {
  await prisma.studioSettings
    .update({
      where: { id: "default" },
      data: {
        rocketChatLastSentAt: new Date(),
        rocketChatLastOk: result.ok,
        rocketChatLastError: result.ok ? null : result.error.slice(0, 500),
      },
    })
    .catch(() => {
      // Bookkeeping must never take the caller down either.
    });
}

/** Posts to an explicit webhook URL. Used by the "send test message" button. */
export async function postToWebhook(
  webhookUrl: string,
  message: RocketChatMessage,
): Promise<DeliveryResult> {
  if (!isUsableWebhookUrl(webhookUrl)) {
    return { ok: false, error: "Webhook URL must be an http(s) address" };
  }

  const body = {
    text: message.text,
    alias: "Studio Tracker",
    ...(message.channel ? { channel: message.channel } : {}),
    ...(message.attachments?.length
      ? { attachments: message.attachments }
      : {}),
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      return {
        ok: false,
        error: `Rocket.Chat replied ${response.status}${detail ? `: ${detail}` : ""}`,
      };
    }

    return { ok: true };
  } catch (e) {
    const reason =
      e instanceof Error
        ? e.name === "TimeoutError"
          ? `No response within ${TIMEOUT_MS / 1000}s`
          : e.message
        : "Unknown error";
    return { ok: false, error: reason };
  }
}

/**
 * Sends a message using the stored configuration. Returns silently when the
 * integration is off or unconfigured, so call sites don't need to check.
 */
export async function sendToRocketChat(
  message: RocketChatMessage,
): Promise<DeliveryResult> {
  const settings = await getStudioSettings();

  if (!settings.rocketChatEnabled) return { ok: false, error: "disabled" };
  if (!isUsableWebhookUrl(settings.rocketChatWebhookUrl)) {
    return { ok: false, error: "not configured" };
  }

  const channel =
    normaliseChannel(message.channel) ??
    normaliseChannel(settings.rocketChatDefaultChannel);

  const result = await postToWebhook(settings.rocketChatWebhookUrl, {
    ...message,
    channel,
  });

  await recordResult(result);
  return result;
}
