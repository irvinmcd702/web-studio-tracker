/**
 * Meetings: the transcript goes in, the point of it comes out.
 *
 * Everything here is pure. Reading a Teams caption file and deciding what to
 * send to a model are both things that go quietly wrong, and both are far
 * easier to get right when a test can hold them.
 *
 * The transcript is stored exactly as it arrived. What the model gets is
 * derived; what somebody said is not rewritten to suit us.
 */

export type MeetingAction = {
  what: string;
  /** A name as it was said in the room, not a user id. Null when unassigned. */
  who: string | null;
  /** Whatever was said about timing, verbatim. Never a date we worked out. */
  when: string | null;
};

export type MeetingSummary = {
  discussed: string[];
  decided: string[];
  actions: MeetingAction[];
  questions: string[];
};

/** An empty summary is a real answer: a meeting can decide nothing. */
export const EMPTY_SUMMARY: MeetingSummary = {
  discussed: [],
  decided: [],
  actions: [],
  questions: [],
};

export function isEmptySummary(summary: MeetingSummary) {
  return (
    summary.discussed.length === 0 &&
    summary.decided.length === 0 &&
    summary.actions.length === 0 &&
    summary.questions.length === 0
  );
}

// --- Reading what the meeting tool produced --------------------------------

const TIMESTAMP = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->/;
const CUE_NUMBER = /^\s*\d+\s*$/;
/** Teams and Zoom both wrap the speaker like this: `<v Maria Kovacs>text</v>`. */
const VOICE_TAG = /<v\s+([^>]+)>([\s\S]*?)<\/v>/i;
const ANY_TAG = /<[^>]+>/g;

/**
 * A caption file turned back into a conversation.
 *
 * WebVTT and SRT are the same shape with different punctuation in the
 * timestamps, so one reader does both. Consecutive lines from one person are
 * joined: caption files break on breath, not on thought, and a model handed
 * forty one-line turns reads it as forty interruptions.
 *
 * Anything that is not a caption file passes through unharmed — somebody
 * pasting their own notes should get their own notes.
 */
export function readTranscript(raw: string) {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return "";

  const lines = text.split("\n");
  const looksLikeCaptions =
    /^WEBVTT/i.test(text) || lines.slice(0, 8).some((l) => TIMESTAMP.test(l));
  if (!looksLikeCaptions) return text;

  const turns: { speaker: string | null; said: string[] }[] = [];

  // A cue is: an optional identifier line, a timestamp line, then the words,
  // until a blank line ends it. Tracking that is what tells an identifier
  // apart from speech — Zoom numbers its cues, Teams gives them a uuid, and
  // neither is anything anybody said.
  let inCue = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      inCue = false;
      continue;
    }
    if (/^WEBVTT/i.test(trimmed)) continue;
    // NOTE, STYLE and REGION blocks carry no speech.
    if (/^(NOTE|STYLE|REGION)\b/.test(trimmed)) continue;
    if (TIMESTAMP.test(trimmed)) {
      inCue = true;
      continue;
    }
    if (!inCue) continue;
    if (CUE_NUMBER.test(trimmed)) continue;

    let speaker: string | null = null;
    let said = trimmed;

    const voice = VOICE_TAG.exec(trimmed);
    if (voice) {
      speaker = voice[1]!.trim();
      said = voice[2]!.trim();
    } else {
      // "Maria Kovacs: we should ship on Friday" — a name, not a sentence
      // that happens to contain a colon, so keep it short and comma-free.
      const colon = trimmed.indexOf(":");
      if (colon > 0 && colon <= 40 && !/[,.?!]/.test(trimmed.slice(0, colon))) {
        speaker = trimmed.slice(0, colon).trim();
        said = trimmed.slice(colon + 1).trim();
      }
    }

    said = said.replace(ANY_TAG, "").trim();
    if (!said) continue;

    const last = turns[turns.length - 1];
    if (last && last.speaker === speaker) last.said.push(said);
    else turns.push({ speaker, said: [said] });
  }

  return turns
    .map((turn) =>
      turn.speaker
        ? `${turn.speaker}: ${turn.said.join(" ")}`
        : turn.said.join(" "),
    )
    .join("\n");
}

/** Everyone the transcript names, in the order they first spoke. */
export function speakersIn(transcript: string) {
  const seen = new Set<string>();
  for (const line of transcript.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0 && colon <= 40) {
      const name = line.slice(0, colon).trim();
      if (name && !/[,.?!]/.test(name)) seen.add(name);
    }
  }
  return [...seen];
}

// --- What the model is allowed to be given ---------------------------------

/** Roughly a one-hour meeting. Beyond this the ends matter more than the middle. */
export const TRANSCRIPT_LIMIT = 80_000;

/**
 * A transcript cut to something a model can hold.
 *
 * When it does not fit, the middle goes rather than the end: a meeting states
 * what it decided as it finishes, and a summary that read only the first half
 * would confidently miss the point.
 *
 * The cut is reported, not hidden. A summary of two thirds of a conversation
 * presented as a summary of the conversation is the kind of quiet wrongness
 * nobody catches until it matters.
 */
export function prepareForModel(transcript: string, limit = TRANSCRIPT_LIMIT) {
  const text = transcript.trim();
  if (text.length <= limit) {
    return { text, truncated: false as const, omitted: 0 };
  }

  const head = Math.floor(limit * 0.4);
  const tail = limit - head;
  const omitted = text.length - limit;

  return {
    text: [
      text.slice(0, head),
      `\n\n[… ${omitted.toLocaleString("en-GB")} characters of the middle are not included …]\n\n`,
      text.slice(text.length - tail),
    ].join(""),
    truncated: true as const,
    omitted,
  };
}

// --- Reading what the model sent back --------------------------------------

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 40);
}

function asActions(value: unknown): MeetingAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") {
        return { what: item.trim(), who: null, when: null };
      }
      if (!item || typeof item !== "object") return null;

      const row = item as Record<string, unknown>;
      const what = typeof row.what === "string" ? row.what.trim() : "";
      if (!what) return null;

      const text = (key: string) => {
        const raw = row[key];
        const value = typeof raw === "string" ? raw.trim() : "";
        // Models like to fill a blank with the word for blank.
        return value && !/^(none|n\/a|null|unknown|-)$/i.test(value)
          ? value
          : null;
      };

      return { what, who: text("who"), when: text("when") };
    })
    .filter((row): row is MeetingAction => row !== null)
    .slice(0, 40);
}

/**
 * The model's reply as a summary, or null if it is not one.
 *
 * Models wrap JSON in prose and fences however firmly you ask them not to, so
 * this looks for the object rather than trusting the whole reply to be it.
 * Returning null on anything doubtful is deliberate: a half-parsed summary
 * would put invented structure on screen next to real decisions.
 */
export function parseSummary(raw: string): MeetingSummary | null {
  const withoutFences = raw.replace(/```(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const row = parsed as Record<string, unknown>;
  return {
    discussed: asStrings(row.discussed),
    decided: asStrings(row.decided),
    actions: asActions(row.actions),
    questions: asStrings(row.questions),
  };
}
