import { prisma } from "./db";
import { isMailConfigured } from "./mail";
import { isAiConfigured } from "./ai";
import { getStudioSettings } from "./settings";

/**
 * The facts behind the client-facing privacy notice, read from the live
 * configuration rather than written down once and left to rot.
 *
 * A notice is a promise about what a system does. Typing that promise into a
 * page by hand means it is true on the day it is written and unverifiable
 * afterwards — switch on a chat integration a year later and the page still
 * says nothing leaves the building. So everything the tracker can know for
 * itself is derived here: which third parties actually receive this customer's
 * data, given which switches are on, for this project.
 *
 * What the tracker cannot know — the legal entity, the lawful basis, the
 * jurisdiction — is not guessed. It comes from the settings, and when it is
 * missing the notice says so.
 */

export type Recipient = {
  name: string;
  what: string;
  why: string;
};

export type PrivacyFacts = {
  controller: { name: string | null; contact: string | null };
  /** The studio's own paragraphs, if anyone wrote them. */
  extra: string | null;
  recipients: Recipient[];
  retention: {
    chatDays: number;
    activityDays: number;
    /** True when nothing has been given a period. */
    indefinite: boolean;
  };
  /** Only meaningful when a project was named. */
  aiForThisProject: boolean;
  projects: { id: string; key: string; name: string; aiAllowed: boolean }[];
};

export async function privacyFacts(clientId: string): Promise<PrivacyFacts> {
  const settings = await getStudioSettings();

  const projects = await prisma.project.findMany({
    where: { clientId },
    select: { id: true, key: true, name: true, aiAllowed: true },
    orderBy: { name: "asc" },
  });

  const recipients: Recipient[] = [];

  // Hosting is always true and always worth stating: the database is somewhere.
  recipients.push({
    name: "Whoever hosts this tracker",
    what: "Everything in it, as the server's database and file storage",
    why: "The software has to run somewhere",
  });

  if (isMailConfigured()) {
    recipients.push({
      name: "The studio's email provider",
      what: "Your address, and the text of any invitation or password link",
      why: "Sending you a link to set your own password",
    });
  }

  // A client's message body is forwarded verbatim when this is on. That makes
  // the chat provider a recipient of what the customer wrote, and it belongs
  // in the notice rather than in a changelog.
  if (settings.rocketChatEnabled && settings.notifyClientMessage) {
    recipients.push({
      name: "The studio's internal chat (Rocket.Chat)",
      what: "The messages you write in this portal, as they are written",
      why: "So the team sees your message without waiting for someone to open the tracker",
    });
  }

  const aiLive = isAiConfigured() && settings.aiEnabled;
  const aiProjects = projects.filter((p) => p.aiAllowed);

  if (aiLive && aiProjects.length) {
    recipients.push({
      name: `A language model provider (${settings.aiModel})`,
      what:
        // Meetings are named separately rather than folded into "task text":
        // a transcript is somebody's speech word for word, which is a
        // different thing to agree to than a ticket description.
        "Project descriptions, task text, portal messages, and the transcript of any meeting somebody asks to have read — only when someone at the studio asks for a draft, and only for: " +
        aiProjects.map((p) => p.name).join(", "),
      why: "Drafting acceptance criteria and summaries, which a person then reads and decides on",
    });
  }

  return {
    controller: {
      name: settings.studioLegalName?.trim() || null,
      contact: settings.privacyContactEmail?.trim() || null,
    },
    extra: settings.privacyNoteExtra?.trim() || null,
    recipients,
    retention: {
      chatDays: settings.retainChatDays,
      activityDays: settings.retainActivityDays,
      indefinite:
        settings.retainChatDays === 0 && settings.retainActivityDays === 0,
    },
    aiForThisProject: aiLive && aiProjects.length > 0,
    projects,
  };
}

/** "kept indefinitely" / "kept for 90 days". */
export function describePeriod(days: number) {
  if (days <= 0) return "kept for as long as the studio holds the project";
  if (days % 365 === 0) {
    const years = days / 365;
    return `kept for ${years} year${years === 1 ? "" : "s"}`;
  }
  return `kept for ${days} days`;
}
