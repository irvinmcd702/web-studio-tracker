import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { draft } from "../lib/ai";
import {
  outreachEmailPrompt,
  replyReadingPrompt,
  requestFromReplyPrompt,
} from "../lib/ai-drafts";
import { readJson, readOneOf, readString } from "../lib/ai-json";
import { db, resetDb } from "./setup/db";

/**
 * The two things worth proving about outreach drafting: what leaves the
 * building, and that the switch is a switch of its own.
 */

const LEAD = {
  companyName: "Analytical Engines",
  title: "Head of Marketing",
  website: "https://engines.example",
  country: "United Kingdom",
  sourceDetail: "Attendee list, WebSummit Oct 2026",
};

describe("what an outreach prompt carries out of the building", () => {
  const built = outreachEmailPrompt({
    studioName: "Northwind Studio",
    studioBlurb: "We build websites for manufacturers.",
    lead: LEAD,
    step: 1,
    purpose: "Open a conversation",
  });
  const whole = `${built.system}\n${built.prompt}`;

  it("never carries the address, the phone number, or the person's name", () => {
    // The name is left out deliberately, not incidentally: the greeting is a
    // token the renderer fills at send time, so the model never needs one and
    // cannot invent one either.
    expect(whole).not.toContain("@");
    expect(whole).not.toContain("Ada");
    expect(whole).not.toMatch(/\+?\d[\d\s()-]{7,}/);
  });

  it("does carry what the studio wants said about the audience", () => {
    expect(whole).toContain("Analytical Engines");
    expect(whole).toContain("Head of Marketing");
    expect(whole).toContain("WebSummit Oct 2026");
  });

  it("tells the model the greeting is a token it must not fill in", () => {
    expect(built.system).toContain("{{greeting}}");
    expect(built.system).toMatch(/must not guess/i);
  });

  it("forbids the things a cold email goes wrong with", () => {
    for (const rule of [/price|rate/i, /guarantee/i, /flattery/i, /urgency/i]) {
      expect(built.system, String(rule)).toMatch(rule);
    }
  });

  it("says which touch this is, and what not to repeat", () => {
    const later = outreachEmailPrompt({
      studioName: "Northwind Studio",
      studioBlurb: null,
      lead: LEAD,
      step: 3,
      purpose: null,
      priorSubjects: ["A quick question", "Following up"],
    });
    expect(later.prompt).toContain("message 3");
    expect(later.prompt).toContain("A quick question; Following up");
  });

  it("says plainly when a field was never recorded, rather than omitting it", () => {
    // A model told nothing about a company will invent one; a model told the
    // studio does not know will not.
    const thin = outreachEmailPrompt({
      studioName: "Northwind Studio",
      studioBlurb: null,
      lead: {
        companyName: null,
        title: null,
        website: null,
        country: null,
        sourceDetail: null,
      },
      step: 1,
      purpose: null,
    });
    expect(thin.prompt).toContain("Company: not recorded");
  });
});

describe("reading a reply", () => {
  const built = replyReadingPrompt({
    ourSubject: "A quick question",
    ourBody: "Hello,\n\nWe build websites for manufacturers.",
    replyBody: "Sounds useful. Can you do e-commerce?",
  });

  it("asks for JSON, because half the answer drives a decision", () => {
    expect(built.system).toContain('{"intent"');
    expect(built.system).toContain("and nothing else");
  });

  it("makes unclear a real answer rather than a failure", () => {
    expect(built.system).toMatch(/unclear is a real answer/i);
  });

  it("asks for a draft reply, and says who sends it", () => {
    // It does draft an answer — what it must not do is decide or send one.
    // The wrapped line is why this is matched loosely.
    expect(built.system).toMatch(/you do not\s+answer it/i);
    expect(built.system).toMatch(/a person at the studio will read before sending/i);
  });

  it("leaves the draft empty for the two intents that want no answer", () => {
    expect(built.system).toMatch(/unsubscribe or out_of_office/i);
  });

  it("carries no address for the person who wrote", () => {
    expect(`${built.system}\n${built.prompt}`).not.toContain("@");
  });
});

describe("filing a request from a reply", () => {
  const built = requestFromReplyPrompt({
    companyName: "Analytical Engines",
    ourSubject: "A quick question",
    replyBody: "Yes, we need a new site by spring. Budget is around twenty.",
  });

  it("forbids inventing a figure, and allows quoting one", () => {
    expect(built.system).toMatch(/word for word/i);
    expect(built.system).toMatch(/never a figure you worked out/i);
  });

  it("asks for a shape the studio's own validation will accept", () => {
    // Deliberately the same bounds as requestSchema in app/actions/requests.ts,
    // so a malformed answer fails against the rules staff go through.
    expect(built.system).toContain("3 to 200 characters");
    expect(built.system).toContain("at least 10 characters");
  });
});

describe("reading JSON back", () => {
  it("takes a bare object and a fenced one", () => {
    expect(readJson<{ a: number }>('{"a":1}')).toEqual({
      ok: true,
      value: { a: 1 },
    });
    expect(readJson<{ a: number }>('```json\n{"a":1}\n```')).toEqual({
      ok: true,
      value: { a: 1 },
    });
    expect(readJson<{ a: number }>('```\n{"a":1}\n```')).toEqual({
      ok: true,
      value: { a: 1 },
    });
  });

  it("refuses prose rather than digging an object out of it", () => {
    // A model that has started explaining itself has stopped following the
    // instruction, and salvaging the object is how an apology ends up in a
    // summary nobody wrote.
    const out = readJson('Certainly! Here is the object:\n{"a":1}');
    expect(out.ok).toBe(false);
    expect(out).toMatchObject({ error: expect.stringMatching(/prose/i) });
  });

  it("refuses broken JSON with a different message", () => {
    expect(readJson("{oops")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not valid JSON/i),
    });
  });

  it("only ever returns a value from the list it was given", () => {
    expect(readOneOf("interested", ["interested", "unclear"] as const)).toBe(
      "interested",
    );
    expect(readOneOf("something-else", ["interested"] as const)).toBeNull();
    expect(readOneOf(7, ["interested"] as const)).toBeNull();
  });

  it("bounds a string and rejects what is not one", () => {
    expect(readString("  hello  ")).toBe("hello");
    expect(readString("")).toBeNull();
    expect(readString(null)).toBeNull();
    expect(readString("x".repeat(50), { max: 10 })).toHaveLength(10);
  });
});

describe("the third gate is a gate of its own", () => {
  beforeEach(async () => {
    await resetDb();
    process.env.OPENROUTER_API_KEY = "a-key";
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    vi.restoreAllMocks();
  });

  const settings = (values: Record<string, boolean>) =>
    db.studioSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...values },
      update: values,
    });

  const ask = (scope: "project" | "outreach") =>
    draft({
      kind: scope === "outreach" ? "outreach_email" : "request_draft",
      scope,
      system: "s",
      prompt: "p",
    });

  it("refuses outreach while its own switch is off, even with the studio default on", async () => {
    await settings({
      aiEnabled: true,
      aiDefaultAllowed: true,
      outreachAiAllowed: false,
    });

    await expect(ask("outreach")).resolves.toMatchObject({
      ok: false,
      failure: "outreach_denied",
    });
  });

  it("refuses a projectless project draft while the studio default is off, with outreach on", async () => {
    // The converse, so the two switches are proved independent rather than
    // one standing in for the other.
    await settings({
      aiEnabled: true,
      aiDefaultAllowed: false,
      outreachAiAllowed: true,
    });

    await expect(ask("project")).resolves.toMatchObject({
      ok: false,
      failure: "studio_default_denied",
    });
  });

  it("still refuses everything when the studio switch is off", async () => {
    await settings({ aiEnabled: false, outreachAiAllowed: true });
    await expect(ask("outreach")).resolves.toMatchObject({
      ok: false,
      failure: "disabled",
    });
  });

  it("refuses to let an outreach draft claim a project at all", async () => {
    await settings({ aiEnabled: true, outreachAiAllowed: true });

    await expect(
      draft({
        kind: "outreach_email",
        scope: "outreach",
        system: "s",
        prompt: "p",
        projectId: "some-project",
      }),
    ).rejects.toThrow(/never belong to a project/i);
  });

  it("writes the lead on the usage row, so a lead's material is countable", async () => {
    await settings({ aiEnabled: true, outreachAiAllowed: true });

    const lead = await db.lead.create({
      data: {
        email: "ada@example.com",
        emailKey: "ada@example.com",
        sourceKind: "MANUAL",
        sourceDetail: "typed in",
      },
    });

    // A provider failure, which is the cheapest path that still records.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));

    await draft({
      kind: "outreach_email",
      scope: "outreach",
      system: "s",
      prompt: "p",
      leadId: lead.id,
    });

    const usage = await db.aiUsage.findFirstOrThrow();
    expect(usage.leadId).toBe(lead.id);
    expect(usage.kind).toBe("outreach_email");
    expect(usage.ok).toBe(false);
  });
});
