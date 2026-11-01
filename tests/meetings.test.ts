import { describe, expect, it } from "vitest";

import {
  EMPTY_SUMMARY,
  isEmptySummary,
  parseSummary,
  prepareForModel,
  readTranscript,
  speakersIn,
} from "../lib/meetings";

const ZOOM_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Maria Kovacs: Right, let's start with the catalogue.

2
00:00:04.200 --> 00:00:07.000
Maria Kovacs: It went to staging on Tuesday.

3
00:00:07.500 --> 00:00:11.000
John Carter: I saw it. The size picker forgets what I chose.
`;

const TEAMS_VTT = `WEBVTT

0d1f8a2e-1
00:00:02.100 --> 00:00:05.400
<v Dana Cole>We agreed to ship the pricing page first.</v>

0d1f8a2e-2
00:00:05.900 --> 00:00:09.100
<v Ivan Petrov>Then I will take the QA pass on Thursday.</v>
`;

describe("reading what the meeting tool wrote", () => {
  it("turns a Zoom caption file back into a conversation", () => {
    expect(readTranscript(ZOOM_VTT)).toBe(
      [
        "Maria Kovacs: Right, let's start with the catalogue. It went to staging on Tuesday.",
        "John Carter: I saw it. The size picker forgets what I chose.",
      ].join("\n"),
    );
  });

  it("joins consecutive lines from one person", () => {
    // Caption files break on breath, not on thought. Two cues from Maria are
    // one thing she said.
    const lines = readTranscript(ZOOM_VTT).split("\n");
    expect(lines).toHaveLength(2);
  });

  it("reads the speaker out of a Teams voice tag", () => {
    expect(readTranscript(TEAMS_VTT)).toBe(
      [
        "Dana Cole: We agreed to ship the pricing page first.",
        "Ivan Petrov: Then I will take the QA pass on Thursday.",
      ].join("\n"),
    );
  });

  it("handles SRT, which is the same thing with commas", () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Sam: The ERP call is moved to Monday.
`;
    expect(readTranscript(srt)).toBe("Sam: The ERP call is moved to Monday.");
  });

  it("leaves somebody's own notes exactly as written", () => {
    const notes =
      "Call with Acme. They want the promo live on the 20th.\nWe said the ERP work has to land first.";
    expect(readTranscript(notes)).toBe(notes);
  });

  it("does not mistake a sentence's colon for a speaker", () => {
    const notes = "One thing was clear: nobody wants to ship on a Friday.";
    expect(readTranscript(notes)).toBe(notes);
  });

  it("is empty for an empty file rather than throwing", () => {
    expect(readTranscript("")).toBe("");
    expect(readTranscript("WEBVTT\n\n")).toBe("");
  });

  it("names everyone who spoke, once each and in order", () => {
    expect(speakersIn(readTranscript(ZOOM_VTT))).toEqual([
      "Maria Kovacs",
      "John Carter",
    ]);
  });
});

describe("what gets sent to the model", () => {
  it("sends a normal transcript whole", () => {
    const prepared = prepareForModel("Maria: short meeting.");
    expect(prepared.truncated).toBe(false);
    expect(prepared.text).toBe("Maria: short meeting.");
  });

  it("keeps the end when it has to cut, because that is where decisions are", () => {
    const long = "x".repeat(500) + "DECIDED AT THE END";
    const prepared = prepareForModel(long, 300);

    expect(prepared.truncated).toBe(true);
    expect(prepared.text).toContain("DECIDED AT THE END");
  });

  it("says how much it left out rather than cutting quietly", () => {
    const prepared = prepareForModel("y".repeat(1000), 400);

    expect(prepared.omitted).toBe(600);
    expect(prepared.text).toContain("not included");
    // And the prompt is actually smaller than the original.
    expect(prepared.text.length).toBeLessThan(1000);
  });
});

describe("reading what the model sent back", () => {
  const good = {
    discussed: ["The catalogue on staging"],
    decided: ["Ship the pricing page first"],
    actions: [
      { what: "Take the QA pass", who: "Ivan", when: "Thursday" },
      { what: "Send the invoice", who: null, when: null },
    ],
    questions: ["When does the ERP data land?"],
  };

  it("reads a plain JSON answer", () => {
    expect(parseSummary(JSON.stringify(good))).toEqual(good);
  });

  it("digs the answer out of a fenced block", () => {
    const wrapped = "Here you go:\n```json\n" + JSON.stringify(good) + "\n```";
    expect(parseSummary(wrapped)).toEqual(good);
  });

  it("survives chatter around the object", () => {
    const noisy = `Sure! ${JSON.stringify(good)} Let me know if you need more.`;
    expect(parseSummary(noisy)?.decided).toEqual(good.decided);
  });

  it("treats the words for nothing as nothing", () => {
    const summary = parseSummary(
      JSON.stringify({
        actions: [{ what: "Do the thing", who: "N/A", when: "unknown" }],
      }),
    );
    expect(summary?.actions[0]).toEqual({
      what: "Do the thing",
      who: null,
      when: null,
    });
  });

  it("accepts an action written as a bare string", () => {
    const summary = parseSummary(
      JSON.stringify({ actions: ["Chase the contract"] }),
    );
    expect(summary?.actions).toEqual([
      { what: "Chase the contract", who: null, when: null },
    ]);
  });

  it("gives back an empty summary when the model found nothing", () => {
    const summary = parseSummary(JSON.stringify(EMPTY_SUMMARY));
    expect(summary).toEqual(EMPTY_SUMMARY);
    expect(isEmptySummary(summary!)).toBe(true);
  });

  it("refuses anything it cannot read rather than half-reading it", () => {
    // Half a summary on screen beside real decisions is worse than none.
    expect(parseSummary("I could not find any decisions.")).toBeNull();
    expect(parseSummary("{ not json at all }")).toBeNull();
    expect(parseSummary("")).toBeNull();
  });

  it("drops an action with nothing to do in it", () => {
    const summary = parseSummary(
      JSON.stringify({ actions: [{ who: "Ivan" }, { what: "  " }] }),
    );
    expect(summary?.actions).toEqual([]);
  });

  it("ignores fields of the wrong shape instead of crashing", () => {
    const summary = parseSummary(
      JSON.stringify({ discussed: "not a list", decided: null, actions: 7 }),
    );
    expect(summary).toEqual(EMPTY_SUMMARY);
  });
});
