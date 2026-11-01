import { prisma } from "./db";
import { collectSignals, sortSignals, type Signal } from "./attention";
import { isMailConfigured, sendMail } from "./mail";
import { appUrl, sendToRocketChat } from "./rocketchat";
import { getStudioSettings } from "./settings";

/**
 * The once-a-day summary.
 *
 * Two channels, and they are not the same message. Email is **personal** — one
 * letter per person containing only what is addressed to them. Chat is a
 * **studio** note in one channel, because an incoming webhook can post to a
 * channel but cannot reach a person, and pretending otherwise would mean
 * broadcasting everyone's overdue tickets to the whole office.
 *
 * Nothing here throws. A digest that fails is a digest that didn't arrive, not
 * an outage.
 */

/** How long a mail digest may cover before a second run is refused. */
const MIN_GAP_MS = 12 * 3_600_000;

/** No letter is worth reading past this; the link carries the rest. */
const MAX_LINES = 12;

export type DigestResult = {
  ok: boolean;
  skipped?: string;
  signals: number;
  emailed: number;
  emailFailed: number;
  /** `unconfigured` means the studio asked for a channel it hasn't set up. */
  email: "sent" | "off" | "unconfigured";
  chat: "sent" | "off" | "empty" | "failed" | "unconfigured";
};

export function groupByRecipient(signals: Signal[]) {
  const byUser = new Map<string, Signal[]>();
  for (const signal of signals) {
    for (const userId of signal.audience) {
      const list = byUser.get(userId);
      if (list) list.push(signal);
      else byUser.set(userId, [signal]);
    }
  }
  return byUser;
}

function group(signals: Signal[]) {
  const byProject = new Map<string, Signal[]>();
  for (const signal of signals) {
    const label = signal.projectKey
      ? `${signal.projectKey} · ${signal.projectName}`
      : (signal.groupLabel ?? "No project");
    const list = byProject.get(label);
    if (list) list.push(signal);
    else byProject.set(label, [signal]);
  }
  return byProject;
}

function countWord(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** One person's letter. Plain text, like every other letter this app sends. */
export function renderPersonalDigest({
  name,
  signals,
}: {
  name: string;
  signals: Signal[];
}) {
  const sorted = sortSignals(signals);
  const urgent = sorted.filter((s) => s.severity === "high").length;

  const lines: string[] = [
    `Hello ${name.split(" ")[0]},`,
    "",
    urgent > 0
      ? `${countWord(urgent, "thing needs", "things need")} attention today, out of ${sorted.length}.`
      : `${countWord(sorted.length, "thing", "things")} to look at today. Nothing is overdue.`,
    "",
  ];

  for (const [project, items] of group(sorted.slice(0, MAX_LINES))) {
    lines.push(project);
    for (const item of items) {
      lines.push(`  · ${item.title}`);
      lines.push(`    ${item.detail}`);
    }
    lines.push("");
  }

  if (sorted.length > MAX_LINES) {
    lines.push(`…and ${sorted.length - MAX_LINES} more.`, "");
  }

  lines.push(appUrl("/dashboard"));

  return {
    subject:
      urgent > 0
        ? `${countWord(urgent, "item", "items")} overdue in Studio Tracker`
        : "Your day in Studio Tracker",
    text: lines.join("\n"),
  };
}

/** The studio note. Only the running-the-project signals belong in a channel. */
export function renderStudioDigest(signals: Signal[]) {
  const managerial = sortSignals(signals.filter((s) => s.managerial));
  if (!managerial.length) return null;

  const high = managerial.filter((s) => s.severity === "high");

  return {
    text: `*Today's attention list* — ${countWord(
      managerial.length,
      "item",
      "items",
    )}${high.length ? `, ${high.length} overdue` : ""}`,
    attachments: [...group(managerial)].slice(0, 8).map(([project, items]) => ({
      title: project,
      text: items
        .slice(0, 6)
        .map((item) => `• ${item.title} — ${item.detail}`)
        .join("\n"),
      color: items.some((i) => i.severity === "high") ? "#dc2626" : "#d97706",
    })),
  };
}

export async function runDailyDigest({
  now = new Date(),
  force = false,
}: { now?: Date; force?: boolean } = {}): Promise<DigestResult> {
  const settings = await getStudioSettings();
  const empty: DigestResult = {
    ok: true,
    signals: 0,
    emailed: 0,
    emailFailed: 0,
    email: "off",
    chat: "off",
  };

  if (!settings.digestChatEnabled && !settings.digestEmailEnabled) {
    return { ...empty, skipped: "The daily digest is switched off" };
  }

  // A cron that fires twice, or a curl run by hand after the scheduled one,
  // must not mail everybody again.
  if (
    !force &&
    settings.digestLastRunAt &&
    now.getTime() - settings.digestLastRunAt.getTime() < MIN_GAP_MS
  ) {
    return { ...empty, skipped: "Already ran within the last 12 hours" };
  }

  const signals = await collectSignals({ now, rules: settings });
  const result: DigestResult = { ...empty, signals: signals.length };

  // --- Email, one letter per person --------------------------------------

  if (settings.digestEmailEnabled && !isMailConfigured()) {
    // Asked for, but impossible. Saying so beats a silent zero.
    result.email = "unconfigured";
  } else if (settings.digestEmailEnabled) {
    result.email = "sent";
    const byUser = groupByRecipient(signals);

    if (byUser.size) {
      const people = await prisma.user.findMany({
        // Clients are deliberately excluded: everything here is studio-internal
        // and none of it is theirs to chase.
        where: {
          id: { in: [...byUser.keys()] },
          isActive: true,
          role: { in: ["ADMIN", "MANAGER", "MEMBER"] },
        },
        select: { id: true, name: true, email: true },
      });

      for (const person of people) {
        const mine = byUser.get(person.id);
        if (!mine?.length) continue;

        const letter = renderPersonalDigest({
          name: person.name,
          signals: mine,
        });
        const sent = await sendMail({ to: person.email, ...letter });
        if (sent.ok) result.emailed += 1;
        else result.emailFailed += 1;
      }
    }
  }

  // --- Chat, one note for the studio --------------------------------------

  if (settings.digestChatEnabled && !settings.rocketChatEnabled) {
    result.chat = "unconfigured";
  } else if (settings.digestChatEnabled) {
    const note = renderStudioDigest(signals);
    if (!note) {
      result.chat = "empty";
    } else {
      const sent = await sendToRocketChat({ channel: null, ...note });
      result.chat = sent.ok ? "sent" : "failed";
    }
  }

  const info = `${result.signals} signals · email ${
    result.email === "sent" ? `${result.emailed} sent` : result.email
  }${result.emailFailed ? ` · ${result.emailFailed} failed` : ""} · chat ${
    result.chat
  }`;

  await prisma.studioSettings
    .update({
      where: { id: "default" },
      data: { digestLastRunAt: now, digestLastInfo: info },
    })
    .catch(() => {
      // Bookkeeping must not fail a run that already delivered.
    });

  return result;
}
