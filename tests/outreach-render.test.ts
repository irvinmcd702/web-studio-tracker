import { describe, expect, it } from "vitest";

import { KNOWN_TOKENS, renderOutreach } from "../lib/outreach-render";

const STUDIO = {
  signature: "Dana Reed, Northwind Studio",
  postalAddress: "Northwind Studio, 14 Bridge Street, Bristol BS1 4TT",
  unsubscribeUrl: "https://tracker.example/unsubscribe/lead-1.abc",
};

const render = (
  body: string,
  lead: Partial<Parameters<typeof renderOutreach>[0]["lead"]> = {},
  studio = STUDIO,
) =>
  renderOutreach({
    subject: "A quick question",
    body,
    lead: { name: null, companyName: null, sourceDetail: null, ...lead },
    studio,
  });

describe("the greeting", () => {
  it("uses the name when there is one", () => {
    expect(render("{{greeting}}\n\nBody text here.", { name: "Ada" }).text)
      .toContain("Hello Ada,");
  });

  it("never produces the empty-merge line", () => {
    // "Hello ," is the single most obvious sign of a mail merge nobody
    // checked, and making the greeting a token the renderer owns means no
    // template can produce it.
    const out = render("{{greeting}}\n\nBody text here.").text;
    expect(out).toContain("Hello,");
    expect(out).not.toContain("Hello ,");
  });
});

describe("tokens", () => {
  it("fills the ones it knows", () => {
    const out = render(
      "{{greeting}} We looked at {{companyName}}.\n\n{{signature}}",
      { name: "Ada", companyName: "Analytical Engines" },
    );
    expect(out.text).toContain("Hello Ada, We looked at Analytical Engines.");
    expect(out.text).toContain("Dana Reed, Northwind Studio");
    expect(out.unknown).toEqual([]);
  });

  it("reports an unknown token instead of silently blanking it", () => {
    // A template that quietly loses {{firstName}} because the token is called
    // {{name}} is one nobody notices is wrong until a hundred people read it.
    const out = render("{{greeting}} Hello {{firstName}}, about {{thing}}.");
    expect(out.unknown).toEqual(["firstName", "thing"]);
    expect(out.text).toContain("{{firstName}}");
  });

  it("leaves a missing optional value empty rather than printing null", () => {
    const out = render("About {{companyName}}. Regards.");
    expect(out.text).not.toContain("null");
    expect(out.text).toContain("About . Regards.");
  });

  it("tolerates spacing inside the braces", () => {
    expect(render("{{ greeting }}", { name: "Ada" }).text).toContain("Hello Ada,");
  });

  it("documents exactly the tokens it fills", () => {
    const filled = render(
      KNOWN_TOKENS.map((t) => `{{${t}}}`).join(" "),
      { name: "Ada", companyName: "Engines" },
    );
    expect(filled.unknown).toEqual([]);
  });
});

describe("the footer, which no template can omit", () => {
  it("always carries the unsubscribe link and the postal address", () => {
    const out = render("{{greeting}}\n\nBody.");
    expect(out.text).toContain(STUDIO.unsubscribeUrl);
    expect(out.text).toContain(STUDIO.postalAddress);
  });

  it("says where the address came from, in the importer's words", () => {
    // Article 14: they did not give the studio their data, so the first
    // message has to say where it came from.
    const out = render("{{greeting}}\n\nBody.", {
      sourceDetail: "Attendee list, WebSummit Oct 2026",
    });
    expect(out.text).toContain(
      "You are receiving this because your address was in: Attendee list, WebSummit Oct 2026.",
    );
  });

  it("still says something when nobody recorded a source", () => {
    const out = render("{{greeting}}\n\nBody.");
    expect(out.text).toContain("your address was on a list the studio holds");
  });
});

describe("what is missing before this may be sent", () => {
  it("names the absent postal address", () => {
    const out = renderOutreach({
      subject: "A quick question",
      body: "{{greeting}}\n\nBody.",
      lead: { name: null, companyName: null, sourceDetail: null },
      studio: { ...STUDIO, postalAddress: null },
    });
    expect(out.missing).toContain("a postal address for the studio");
  });

  it("names an empty subject and an empty body", () => {
    const out = renderOutreach({
      subject: "   ",
      body: "  ",
      lead: { name: null, companyName: null, sourceDetail: null },
      studio: STUDIO,
    });
    expect(out.missing).toEqual(
      expect.arrayContaining(["a subject", "a body"]),
    );
  });

  it("is empty when everything is there", () => {
    expect(render("{{greeting}}\n\nBody text here.").missing).toEqual([]);
  });
});
