import { prisma } from "./db";
import { getStudioSettings } from "./settings";

/**
 * Drafting with a model, through OpenRouter.
 *
 * Three rules hold everywhere in this file and in everything that calls it:
 *
 * 1. **It only ever produces a draft.** Nothing here writes to a ticket, moves
 *    anything, decides an approval or touches an hour or a sum of money. A
 *    person reads what came back and presses Save, or doesn't.
 * 2. **Two switches, both off by default.** The studio turns the feature on;
 *    each project decides separately whether its material may be sent. Both
 *    are checked here, on the server, so hiding a button is not the security.
 * 3. **Every call is recorded** — tokens, cost, who asked, which project, and
 *    the error when it failed. A studio paying per token should be able to see
 *    what it paid for, and a studio that sent a client's brief to a third
 *    party should be able to say when and for whom.
 *
 * The key is an environment variable, like the SMTP password: infrastructure,
 * rotated by whoever runs the server, never shown in the interface.
 */

const TIMEOUT_MS = 45_000;

/**
 * OpenRouter by default, but any OpenAI-compatible endpoint works — a proxy
 * inside the studio's own network, or a model running on its own hardware.
 * For a studio whose answer to "may our client's brief leave the building" is
 * no, that is the setting that makes the feature usable at all.
 */
function endpoint() {
  const base = (
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1"
  ).replace(/\/$/, "");
  return `${base}/chat/completions`;
}

export type AiFailure =
  | "no_key"
  | "disabled"
  | "project_denied"
  | "studio_default_denied"
  | "outreach_denied"
  | "provider"
  | "timeout"
  | "empty";

/**
 * Which question is being asked about sending material away.
 *
 * `project` covers everything the studio is already working on. `outreach`
 * covers people who never asked to be contacted, whose letters are a sharper
 * thing to hand a third party than a customer's own brief — so it has a switch
 * of its own rather than inheriting the studio default.
 */
export type DraftScope = "project" | "outreach";

export type AiUsageInfo = {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
};

export type AiResult =
  | { ok: true; text: string; usage: AiUsageInfo }
  | { ok: false; failure: AiFailure; message: string };

/** What was asked for. Stored on every usage row. */
export type DraftKind =
  | "acceptance"
  | "chat_summary"
  | "request_draft"
  | "meeting_summary"
  | "outreach_email"
  | "reply_read"
  | "request_from_reply";

export function isAiConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export type AiStatus = {
  /** A key exists on this server. */
  configured: boolean;
  /** The studio switched the feature on. */
  enabled: boolean;
  model: string;
  /** Both of the above; anything less means no button should be offered. */
  usable: boolean;
  /**
   * Whether a stranger's letter may go to the provider. Independent of
   * `usable`: a studio can have drafting on and this off, and the outreach
   * buttons then do not exist while every other one does.
   */
  outreachAllowed: boolean;
};

export async function aiStatus(): Promise<AiStatus> {
  const settings = await getStudioSettings();
  const configured = isAiConfigured();
  return {
    configured,
    enabled: settings.aiEnabled,
    model: settings.aiModel,
    usable: configured && settings.aiEnabled,
    outreachAllowed:
      configured && settings.aiEnabled && settings.outreachAiAllowed,
  };
}

/**
 * Whether this project's material may leave the building. Read it before
 * offering a button and again before sending — `draft()` does the second
 * check itself, so a call site that forgets still cannot leak.
 */
export async function aiAllowedForProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { aiAllowed: true },
  });
  return project?.aiAllowed ?? false;
}

const MESSAGES: Record<AiFailure, string> = {
  no_key: "No model provider is configured on this server",
  disabled: "Drafting with a model is switched off for the studio",
  project_denied:
    "This project does not allow its material to be sent to the model provider",
  studio_default_denied:
    "This does not belong to a project yet, so it follows the studio default, which is not to send anything",
  outreach_denied:
    "Outreach drafting is switched off — that is a separate answer from the one the studio gives new projects",
  provider: "The model provider could not be reached",
  timeout: "The model did not answer in time",
  empty: "The model returned nothing usable",
};

export async function draft({
  kind,
  system,
  prompt,
  projectId = null,
  userId = null,
  leadId = null,
  maxTokens = 900,
  scope = "project",
}: {
  kind: DraftKind;
  system: string;
  prompt: string;
  projectId?: string | null;
  userId?: string | null;
  /** Whose material this is, when it belongs to a lead rather than a project. */
  leadId?: string | null;
  maxTokens?: number;
  /** Defaults to today's behaviour, so existing call sites are unchanged. */
  scope?: DraftScope;
}): Promise<AiResult> {
  const settings = await getStudioSettings();
  const key = process.env.OPENROUTER_API_KEY;

  const refuse = async (failure: AiFailure, detail?: string) => {
    // Refusals before the request are configuration, not spend, and writing a
    // usage row for each would bury the calls that cost something.
    if (
      failure === "provider" ||
      failure === "timeout" ||
      failure === "empty"
    ) {
      await record({
        kind,
        model: settings.aiModel,
        projectId,
        userId,
        leadId,
        ok: false,
        error: detail ?? MESSAGES[failure],
      });
    }
    return {
      ok: false as const,
      failure,
      message: detail ? `${MESSAGES[failure]} — ${detail}` : MESSAGES[failure],
    };
  };

  if (!key) return refuse("no_key");
  if (!settings.aiEnabled) return refuse("disabled");

  if (scope === "outreach") {
    // Outreach has no project to ask, and the studio's answer for new projects
    // is not the same question — see `DraftScope`.
    if (projectId) throw new Error("outreach drafts never belong to a project");
    if (!settings.outreachAiAllowed) return refuse("outreach_denied");
  } else if (projectId) {
    if (!(await aiAllowedForProject(projectId)))
      return refuse("project_denied");
  } else if (!settings.aiDefaultAllowed) {
    // An incoming request has no project to ask, so it inherits the answer the
    // studio gives new projects. Otherwise there would be one door with no lock.
    return refuse("studio_default_denied");
  }

  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // OpenRouter uses these for attribution on its dashboard.
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
        "X-Title": "Studio Tracker",
      },
      body: JSON.stringify({
        model: settings.aiModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
        // Ask for the cost of the call along with the token counts.
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return refuse(
      timedOut ? "timeout" : "provider",
      timedOut ? undefined : e instanceof Error ? e.message : "Unknown error",
    );
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    return refuse(
      "provider",
      `${response.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  const body = await response.json().catch(() => null);
  const text: string = body?.choices?.[0]?.message?.content ?? "";

  const usage: AiUsageInfo = {
    promptTokens: Number(body?.usage?.prompt_tokens ?? 0),
    completionTokens: Number(body?.usage?.completion_tokens ?? 0),
    costUsd: typeof body?.usage?.cost === "number" ? body.usage.cost : null,
  };

  if (!text.trim()) return refuse("empty");

  await record({
    kind,
    model: settings.aiModel,
    projectId,
    userId,
    leadId,
    ok: true,
    ...usage,
  });

  return { ok: true, text: text.trim(), usage };
}

async function record({
  kind,
  model,
  projectId,
  userId,
  leadId = null,
  ok,
  error,
  promptTokens = 0,
  completionTokens = 0,
  costUsd = null,
}: {
  kind: DraftKind;
  model: string;
  projectId: string | null;
  userId: string | null;
  leadId?: string | null;
  ok: boolean;
  error?: string;
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number | null;
}) {
  // Accounting must never be what breaks a draft that already came back.
  await prisma.aiUsage
    .create({
      data: {
        kind,
        model,
        projectId,
        userId,
        leadId,
        ok,
        error: error?.slice(0, 500),
        promptTokens,
        completionTokens,
        costUsd,
      },
    })
    .catch(() => {});

  await prisma.studioSettings
    .update({
      where: { id: "default" },
      data: {
        aiLastUsedAt: new Date(),
        aiLastError: ok ? null : (error ?? null),
      },
    })
    .catch(() => {});
}

/** For the settings page: what this has cost so far. */
export async function aiSpend(since: Date) {
  const [totals, failures] = await Promise.all([
    prisma.aiUsage.aggregate({
      where: { createdAt: { gte: since }, ok: true },
      _sum: { promptTokens: true, completionTokens: true, costUsd: true },
      _count: true,
    }),
    prisma.aiUsage.count({ where: { createdAt: { gte: since }, ok: false } }),
  ]);

  return {
    calls: totals._count,
    failures,
    promptTokens: totals._sum.promptTokens ?? 0,
    completionTokens: totals._sum.completionTokens ?? 0,
    /** Null when the provider never reported a cost. */
    costUsd: totals._sum.costUsd,
  };
}
