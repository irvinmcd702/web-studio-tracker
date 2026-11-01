import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { stageTrack } from "../lib/approvals";
import { StageTrack } from "../components/approval/stage-track";

/**
 * What the stage path actually renders.
 *
 * `stageTrack` is tested next to the rest of the approval rules; this is the
 * other half — that the thing on screen says out loud what the state is. The
 * states are drawn in four colours, and a colour is not a statement: a client
 * reading through a screen reader, or through the eyes most colour-blindness
 * leaves you with, gets nothing from a green ring. So the assertions here are
 * mostly about words and roles, which are the part that carries the meaning.
 */

const stages = (rows: [string, string][]) =>
  stageTrack(
    rows.map(([title, status]) => ({
      id: title,
      title,
      description: `about ${title}`,
      status,
    })),
    { plan: true },
  );

const render = (rows: [string, string][]) =>
  renderToStaticMarkup(<StageTrack stages={stages(rows)} />);

describe("StageTrack", () => {
  it("is an ordered list, because the stages are in an order", () => {
    const markup = render([
      ["Design", "APPROVED"],
      ["Build", "DRAFT"],
    ]);

    expect(markup.startsWith("<ol")).toBe(true);
    expect(markup.match(/<li\b/g)).toHaveLength(2);
  });

  it("renders nothing at all when there are no stages", () => {
    expect(renderToStaticMarkup(<StageTrack stages={[]} />)).toBe("");
  });

  it("names every state it draws, rather than only colouring it", () => {
    const markup = render([
      ["Brief", "APPROVED"],
      ["Design", "CHANGES_REQUESTED"],
      ["Build", "PENDING"],
    ]);

    expect(markup).toContain("Accepted");
    expect(markup).toContain("Changes requested");
    expect(markup).toContain("Waiting for you");
  });

  it("tells a screen reader which step the project is standing on", () => {
    const markup = render([
      ["Brief", "APPROVED"],
      ["Design", "PENDING"],
      ["Build", "DRAFT"],
    ]);

    expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
    // On the second stage: the first <li> is the approved one.
    const upToCurrent = markup.slice(0, markup.indexOf('aria-current="step"'));
    expect(upToCurrent.match(/<li\b/g)).toHaveLength(2);
  });

  it("claims nothing under a stage nobody has reached", () => {
    const markup = render([
      ["Brief", "APPROVED"],
      ["Design", "DRAFT"],
      ["Launch", "DRAFT"],
    ]);

    expect(markup).toContain("In progress");
    // "Launch" is the last one and carries no pill — the only words under it
    // are its own name.
    const launch = markup.slice(markup.indexOf("Launch"));
    for (const label of [
      "Accepted",
      "In progress",
      "Waiting for you",
      "Changes requested",
    ]) {
      expect(launch).not.toContain(label);
    }
  });

  it("swaps the number for a tick once a stage is accepted", () => {
    const accepted = render([["Brief", "APPROVED"]]);
    const waiting = render([["Brief", "PENDING"]]);

    expect(accepted).toContain("<svg");
    expect(waiting).not.toContain("<svg");
    expect(waiting).toContain(">1<");
  });

  it("keeps what a draft says out of the markup", () => {
    const markup = render([["Launch", "DRAFT"]]);

    expect(markup).toContain("Launch");
    expect(markup).not.toContain("about Launch");
  });

  it("shows the description of a stage the client was sent", () => {
    expect(render([["Brief", "PENDING"]])).toContain("about Brief");
  });

  it("gives the circle exactly one background and one text colour", () => {
    // The classes are built one whole string per state for this reason: two
    // Tailwind utilities for the same property are settled by stylesheet
    // order, so a duplicate here is a colour decided by accident.
    for (const status of ["APPROVED", "PENDING", "DRAFT"]) {
      const markup = render([["Stage", status]]);
      const circle = markup.match(/class="relative z-10 flex[^"]*"/)?.[0] ?? "";

      // Only the utilities that set a colour — `text-[12.5px]` is a size.
      const colours = circle.match(/\btext-(white|\[var\(--color-[^\]]+\)\])/g);

      expect(circle.match(/\bbg-/g), status).toHaveLength(1);
      expect(colours, status).toHaveLength(1);
    }
  });
});
