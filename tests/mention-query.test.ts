import { describe, expect, it } from "vitest";

import { applyMention, mentionQueryAt, rankPeople } from "../lib/mention-query";
import { parseHandles } from "../lib/mentions";

/** Where the caret is, written the way it reads: `|` marks it. */
function at(marked: string) {
  const caret = marked.indexOf("|");
  return mentionQueryAt(marked.replace("|", ""), caret);
}

const CREW = [
  { id: "1", name: "Anna Petrova", handle: "anna", avatarColor: "#111" },
  { id: "2", name: "Dana Reed", handle: "dana", avatarColor: "#222" },
  { id: "3", name: "Ivan Novak", handle: "ivan.n", avatarColor: "#333" },
  { id: "4", name: "Sam Okafor", handle: "sam", avatarColor: "#444" },
];

/** A project of two, in a studio whose managers can read everything. */
const MIXED = [
  { id: "1", name: "Anna Petrova", handle: "anna", onProject: false },
  { id: "2", name: "Dana Reed", handle: "dana", onProject: true },
  { id: "3", name: "Ivan Novak", handle: "ivan.n", onProject: false },
  { id: "4", name: "Sam Okafor", handle: "sam", onProject: true },
];

describe("knowing when somebody is writing a mention", () => {
  it("opens on the @ itself, before anything is typed", () => {
    expect(at("looks good @|")).toEqual({ at: 11, text: "" });
  });

  it("carries what has been typed so far", () => {
    expect(at("ping @dan|")).toEqual({ at: 5, text: "dan" });
  });

  it("stays quiet inside an email address", () => {
    // The character before the @ is a letter, so there is nothing to complete.
    expect(at("write to dana@stu|")).toBeNull();
  });

  it("stays quiet with no @ at all", () => {
    expect(at("just a sentence|")).toBeNull();
  });

  it("closes once the mention is finished by a space", () => {
    expect(at("ping @dana |")).toBeNull();
  });

  it("opens for a mention typed before existing text", () => {
    expect(at("@da| please look")).toEqual({ at: 0, text: "da" });
  });

  it("opens when the mention is being put in front of a word", () => {
    // Going back to name somebody before something already written. Only what
    // is behind the caret decides; "about" is not part of the handle.
    expect(at("ping @ol|about the promo")).toEqual({ at: 5, text: "ol" });
  });

  it("puts a space in so the word after it is not swallowed", () => {
    const query = at("ping @ol|about the promo")!;
    const result = applyMention("ping @olabout the promo", query, "design");

    expect(result.value).toBe("ping @design about the promo");
    expect(parseHandles(result.value)).toEqual(["design"]);
  });

  it("follows the @ nearest the caret, not the first one", () => {
    expect(at("@dana and @sa|")).toEqual({ at: 10, text: "sa" });
  });
});

describe("offering the right people", () => {
  it("offers everybody before anything is typed", () => {
    expect(rankPeople(CREW, "").map((p) => p.handle)).toEqual([
      "anna",
      "dana",
      "ivan.n",
      "sam",
    ]);
  });

  it("puts a handle that starts with what was typed first", () => {
    // "an" is inside Dana and Ivan too, and they are worth offering — but the
    // person typing it almost always means Anna.
    const offered = rankPeople(CREW, "an").map((p) => p.handle);
    expect(offered[0]).toBe("anna");
    expect(offered).toContain("dana");
    expect(offered).toContain("ivan.n");
  });

  it("matches a name people spell instead of a handle", () => {
    expect(rankPeople(CREW, "novak").map((p) => p.handle)).toEqual(["ivan.n"]);
  });

  it("offers nobody rather than somebody wrong", () => {
    expect(rankPeople(CREW, "zzz")).toEqual([]);
  });

  it("puts the project's own people above everyone else", () => {
    // Alphabetically Anna leads, but she is not on this project.
    expect(rankPeople(MIXED, "").map((p) => p.handle)).toEqual([
      "dana",
      "sam",
      "anna",
      "ivan.n",
    ]);
  });

  it("keeps that order even when an outsider matches better", () => {
    // "an" is the start of Anna's handle and only buried inside Dana's, but
    // Dana is on the project and Anna is not.
    expect(rankPeople(MIXED, "an").map((p) => p.handle)).toEqual([
      "dana",
      "anna",
      "ivan.n",
    ]);
  });

  it("still offers somebody who is only on the project by role", () => {
    // Naming a manager who is not on the crew has to stay possible: it is
    // what escalation is.
    expect(rankPeople(MIXED, "ivan").map((p) => p.handle)).toEqual(["ivan.n"]);
  });

  it("keeps the list short enough to read", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      name: `Person ${i}`,
      handle: `person${i}`,
      avatarColor: "#000",
    }));
    expect(rankPeople(many, "person")).toHaveLength(6);
  });
});

describe("putting the chosen handle in", () => {
  it("replaces what was typed and leaves the caret after it", () => {
    const query = at("ping @dan|")!;
    const result = applyMention("ping @dan", query, "dana");

    expect(result.value).toBe("ping @dana ");
    expect(result.caret).toBe(result.value.length);
  });

  it("keeps the rest of the sentence, and the caret before it", () => {
    const query = at("ping @dan| about the invoice")!;
    const result = applyMention("ping @dan about the invoice", query, "dana");

    expect(result.value).toBe("ping @dana about the invoice");
    expect(result.value.slice(result.caret)).toBe("about the invoice");
  });

  it("completes an @ with nothing after it yet", () => {
    const query = at("cc @|")!;
    expect(applyMention("cc @", query, "sam").value).toBe("cc @sam ");
  });

  it("writes something the server will actually parse", () => {
    // The two halves of the feature have to agree: whatever the picker puts in
    // is what recordMentions later looks for.
    for (const handle of CREW.map((p) => p.handle)) {
      const query = at("hi @|")!;
      const { value } = applyMention("hi @", query, handle);
      expect(parseHandles(value)).toEqual([handle]);
    }
  });
});
