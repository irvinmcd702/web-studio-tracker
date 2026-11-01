import { formatDate, ticketKey } from "./utils";

/**
 * What is actually sent to the model, and what it is told to do with it.
 *
 * These are plain functions with no side effects on purpose: what leaves the
 * building for each feature is a thing anyone can read here, and a thing the
 * tests can assert on. If a field is not in one of these builders, it is not
 * sent.
 */

/** Applies to every draft. The limits matter more than the task. */
const RULES = [
  "You draft; a person at the studio reads what you wrote and decides.",
  "Use only what is in the material below. Never invent a fact, a name, a date or a requirement that is not there.",
  "Never state hours, prices, estimates or deadlines unless they appear verbatim in the material, and never calculate them.",
  "If the material is too thin to do the job, say exactly what is missing in one line instead of filling the gap.",
  "Write plainly. No preamble, no apology, no offers of further help. Output only the thing asked for.",
].join("\n");

export type AcceptanceInput = {
  number: number;
  title: string;
  description: string | null;
  type: string;
  project: { key: string; name: string; description: string | null };
};

/**
 * Acceptance criteria for one ticket.
 *
 * Sent: the ticket's title, description and type, and the project's name and
 * scope text. Not sent: client chat, other tickets, hours, money, people.
 */
export function acceptancePrompt(ticket: AcceptanceInput) {
  const system = [
    "You write acceptance criteria for tickets in a web development studio.",
    "",
    RULES,
    "",
    "Format: a markdown checklist of 3 to 7 items, each starting with '- [ ] '.",
    "Each item is one testable statement about the finished work — something a",
    "reviewer can confirm or deny by looking. No implementation instructions,",
    "no tasks, no 'consider' or 'make sure to'.",
  ].join("\n");

  const prompt = [
    `Project: ${ticket.project.name} (${ticket.project.key})`,
    ticket.project.description?.trim()
      ? `Project scope: ${ticket.project.description.trim()}`
      : null,
    "",
    `Ticket ${ticketKey(ticket.project.key, ticket.number)} (${ticket.type.toLowerCase()}): ${ticket.title}`,
    "",
    "Description:",
    ticket.description?.trim() || "(none written)",
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, prompt };
}

export type ChatLine = {
  authorName: string;
  isClient: boolean;
  isInternal: boolean;
  createdAt: Date;
  body: string;
};

/**
 * A catch-up on a client conversation.
 *
 * Sent: the message thread of one project, including the studio's internal
 * notes — they are part of what the thread means, and the reader is the
 * manager who wrote them. Not sent: tickets, budget, other projects.
 */
export function chatSummaryPrompt({
  projectName,
  clientName,
  messages,
}: {
  projectName: string;
  clientName: string | null;
  messages: ChatLine[];
}) {
  const system = [
    "You summarise a conversation between a web development studio and its client",
    "for a manager who has been away and needs to catch up in thirty seconds.",
    "",
    RULES,
    "",
    "Format, in this order, omitting any heading that has nothing under it:",
    "**Where it stands** — two or three sentences.",
    "**Waiting on the client** — bullets, or omit.",
    "**Waiting on us** — bullets, or omit.",
    "**Decided** — bullets of what was actually agreed, or omit.",
    "Attribute anything contested to whoever said it. Do not resolve a",
    "disagreement the people in the thread have not resolved.",
  ].join("\n");

  const prompt = [
    `Project: ${projectName}${clientName ? ` — client: ${clientName}` : ""}`,
    "",
    "Thread, oldest first. Lines marked [internal] were not seen by the client.",
    "",
    ...messages.map(
      (m) =>
        `${formatDate(m.createdAt)} — ${m.authorName}` +
        `${m.isClient ? " (client)" : ""}${m.isInternal ? " [internal]" : ""}: ${m.body.trim()}`,
    ),
  ].join("\n");

  return { system, prompt };
}

export type RequestInput = {
  title: string;
  description: string;
  companyName: string | null;
  budgetNote: string | null;
  source: string | null;
};

/**
 * A first cut at the work in an incoming enquiry.
 *
 * Sent: the request as it was submitted. Not sent: the contact's name, email
 * or phone — a draft of the work does not need them, so they do not go.
 */
export function requestDraftPrompt(request: RequestInput) {
  const system = [
    "You turn an incoming enquiry to a web development studio into a first cut",
    "at the work, for a project manager to correct.",
    "",
    RULES,
    "",
    "Format:",
    "**Scope as understood** — two or three sentences in the studio's own words.",
    "**Tickets** — 3 to 8 lines, each 'Title — one sentence of what it covers'.",
    "**Questions before quoting** — what the enquiry does not say and must,",
    "before anyone can price or plan it. This section is the useful one; do not",
    "pad it and do not leave it out.",
    "",
    "Never guess a technology, a platform or an integration the enquiry does not name.",
  ].join("\n");

  const prompt = [
    request.companyName ? `Company: ${request.companyName}` : null,
    request.source ? `Came in via: ${request.source}` : null,
    request.budgetNote
      ? `What they said about budget: ${request.budgetNote}`
      : null,
    "",
    `Enquiry: ${request.title}`,
    "",
    request.description.trim(),
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, prompt };
}

export type MeetingInput = {
  title: string;
  heldAt: Date;
  project: { key: string; name: string };
  transcript: string;
  truncated: boolean;
};

/**
 * What a meeting was about and what it settled.
 *
 * Sent: the transcript, the project's name and key, and the meeting's own
 * title and date. That is a great deal of somebody's speech, which is why
 * this feature sits behind the same two switches as every other draft and why
 * the privacy notice names it.
 *
 * The output is JSON rather than prose because half of it becomes tickets.
 * Prose would have to be parsed by guesswork, and guesswork about who agreed
 * to do what is exactly the wrong place for it.
 */
export function meetingPrompt(meeting: MeetingInput) {
  const system = [
    "You read the transcript of a meeting at a web development studio and",
    "write down what it was about and what it settled.",
    "",
    RULES,
    "",
    "Answer with a single JSON object and nothing else:",
    '{"discussed": [], "decided": [], "actions": [{"what": "", "who": null, "when": null}], "questions": []}',
    "",
    "discussed — the subjects that took up the meeting, one short line each.",
    "decided — only what was actually settled. A decision somebody proposed and",
    "  nobody agreed to is not a decision; leave it out or put it in questions.",
    "actions — something a named or unnamed person is to do. 'what' is one line",
    "  in the imperative. 'who' is the name as it was said, or null. 'when' is",
    "  what was said about timing, word for word, or null — never a date you",
    "  worked out yourself.",
    "questions — what was raised and left open.",
    "",
    "Any of the four may be empty. A meeting that decided nothing is a real",
    "meeting, and reporting a decision it did not take is worse than reporting",
    "none. Do not carry an item into more than one list.",
  ].join("\n");

  const prompt = [
    `Project: ${meeting.project.name} (${meeting.project.key})`,
    `Meeting: ${meeting.title}`,
    `Held: ${formatDate(meeting.heldAt)}`,
    meeting.truncated
      ? "Note: the middle of this transcript is missing, marked in place. Do not guess at what was in the gap."
      : null,
    "",
    "Transcript:",
    meeting.transcript,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, prompt };
}

/**
 * Extra rules for anything written to somebody who did not ask to hear from
 * the studio. They are stricter than `RULES` because the reader is stricter:
 * a customer forgives an awkward sentence, a stranger deletes it.
 */
const OUTREACH_RULES = [
  "You are writing to somebody who did not ask to hear from this studio. Write as if they will be irritated, because they might be.",
  "Never claim a fact about their business you were not given. Never say anyone looked at their website, read their work, or noticed anything, unless the material below says so.",
  "Never state a price, a rate, a timeline, a discount, a guarantee or a number of any kind.",
  "No flattery, no urgency, no 'I noticed', no 'quick question', no rhetorical questions, no exclamation marks.",
  "Under 120 words. One real question at the end, which they can answer in a sentence.",
  "The first line is exactly {{greeting}} and nothing else. You have not been told their name and must not guess at one.",
].join("\n");

export type OutreachLeadInput = {
  companyName: string | null;
  title: string | null;
  website: string | null;
  country: string | null;
  /** The studio's own note about where the address came from. */
  sourceDetail: string | null;
};

/**
 * A first cut at one message in a sequence.
 *
 * **Sent:** the studio's description of itself, the lead's company, job title,
 * website and country, the studio's note of where the address came from, which
 * step of the sequence this is, and the subject lines of earlier touches.
 *
 * **Not sent: the email address, the phone number, or the person's name.** The
 * name is left out deliberately rather than incidentally — the greeting is a
 * token the renderer fills at send time, so the model never needs it, and the
 * invariant `tests/ai.test.ts` already holds for enquiries extends to outreach
 * without an exception to remember.
 */
export function outreachEmailPrompt({
  studioName,
  studioBlurb,
  lead,
  step,
  purpose,
  priorSubjects = [],
}: {
  studioName: string;
  studioBlurb: string | null;
  lead: OutreachLeadInput;
  /** 1 for the first touch. */
  step: number;
  /** What this touch is for, in the studio's words. */
  purpose: string | null;
  priorSubjects?: string[];
}) {
  const system = [
    `You draft cold outreach for ${studioName}, a web development studio.`,
    "",
    RULES,
    "",
    OUTREACH_RULES,
    "",
    "Answer with a subject line on the first line, then a blank line, then the",
    "message. Nothing else — no labels, no quotes around the subject.",
  ].join("\n");

  const prompt = [
    studioBlurb?.trim() ? `The studio, in its own words: ${studioBlurb.trim()}` : null,
    "",
    "About the recipient, and this is everything that is known:",
    `- Company: ${lead.companyName ?? "not recorded"}`,
    `- Their role: ${lead.title ?? "not recorded"}`,
    `- Website: ${lead.website ?? "not recorded"}`,
    `- Country: ${lead.country ?? "not recorded"}`,
    lead.sourceDetail?.trim()
      ? `- Where the studio got their address: ${lead.sourceDetail.trim()}`
      : null,
    "",
    step === 1
      ? "This is the first message. They have never heard from the studio."
      : `This is message ${step}. They have had ${step - 1} before and answered none of them.`,
    priorSubjects.length
      ? `Earlier subject lines, which this must not repeat: ${priorSubjects.join("; ")}`
      : null,
    purpose?.trim() ? `What this message is for: ${purpose.trim()}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, prompt };
}

/**
 * Reading what somebody wrote back.
 *
 * JSON rather than prose, for the same reason `meetingPrompt` returns JSON:
 * half the answer drives a decision, and deciding whether somebody said yes by
 * reading prose with a regular expression is exactly the wrong place for
 * guesswork.
 *
 * **Sent:** the subject and body of what the studio sent, and their reply.
 * **Not sent:** their address, their name, or anything about the campaign.
 */
export function replyReadingPrompt({
  ourSubject,
  ourBody,
  replyBody,
}: {
  ourSubject: string;
  ourBody: string;
  replyBody: string;
}) {
  const system = [
    "You read a reply to a cold email and report what it says. You do not",
    "answer it and you do not decide anything.",
    "",
    RULES,
    "",
    "Answer with a single JSON object and nothing else:",
    '{"intent": "", "confidence": "high|low", "summary": "", "asks": [], "suggestedReply": ""}',
    "",
    "intent is exactly one of: interested, not_now, not_interested, unsubscribe,",
    "  out_of_office, referral, question, unclear.",
    "confidence is high only when the words themselves settle it. A polite note",
    "  that could be either is low, and unclear is a real answer.",
    "summary is one line of what they said, in their terms.",
    "asks lists anything they asked for, one short line each; empty is normal.",
    "suggestedReply is a draft a person at the studio will read before sending.",
    "  Under 100 words, no prices, no dates, no commitments. Leave it empty if",
    "  the intent is unsubscribe or out_of_office — neither wants an answer.",
  ].join("\n");

  const prompt = [
    "What the studio sent:",
    `Subject: ${ourSubject}`,
    ourBody,
    "",
    "---",
    "",
    "What they wrote back:",
    replyBody,
  ].join("\n");

  return { system, prompt };
}

/**
 * Turning an interested reply into a request the studio can triage.
 *
 * The shape is chosen to pass `requestSchema` in `app/actions/requests.ts`, so
 * a malformed answer fails against the same validation staff go through rather
 * than against something written specially for the model.
 */
export function requestFromReplyPrompt({
  companyName,
  ourSubject,
  replyBody,
}: {
  companyName: string | null;
  ourSubject: string;
  replyBody: string;
}) {
  const system = [
    "You turn a reply to a cold email into an entry in a studio's enquiry",
    "inbox, so a project manager can pick it up.",
    "",
    RULES,
    "",
    "Answer with a single JSON object and nothing else:",
    '{"title": "", "description": "", "budgetNote": null}',
    "",
    "title is one line, 3 to 200 characters, naming what they seem to want.",
    "description is at least 10 characters: what they actually said, and what",
    "  a manager would have to ask before quoting. Do not pad it.",
    "budgetNote is only what they said about money, word for word, or null.",
    "  Never a figure you worked out, and never a range you thought reasonable.",
  ].join("\n");

  const prompt = [
    companyName ? `Company: ${companyName}` : null,
    `The studio's subject line was: ${ourSubject}`,
    "",
    "They replied:",
    replyBody,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { system, prompt };
}
