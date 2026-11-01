import { beforeEach, describe, expect, it } from "vitest";

import * as timeline from "../lib/timeline";
import { describeStatusChange, readTimeline, recordTimeline } from "../lib/timeline";
import { db, makeUser, resetDb } from "./setup/db";

async function makeClient(name = "Northwind") {
  return db.client.create({ data: { name } });
}

async function makeRequest(clientId?: string) {
  return db.clientRequest.create({
    data: {
      title: "A new marketing site",
      description: "Five pages, a blog, and a form that reaches us.",
      clientId: clientId ?? null,
    },
  });
}

describe("the diary is append-only", () => {
  beforeEach(resetDb);

  it("offers no way to change an entry once it is written", () => {
    // The guarantee is the absence of a function, so the test is an assertion
    // about the module's surface. Anything named update/edit/delete appearing
    // here later should fail loudly rather than quietly become possible.
    const surface = Object.keys(timeline);
    expect(surface).toEqual(
      expect.arrayContaining([
        "recordTimeline",
        "readTimeline",
        "describeStatusChange",
      ]),
    );
    expect(surface.join(" ")).not.toMatch(/update|edit|delete|remove/i);
  });

  it("adds a second entry rather than replacing the first", async () => {
    const client = await makeClient();

    await recordTimeline({
      kind: "NOTE",
      summary: "Said the budget lands in March",
      clientId: client.id,
    });
    await recordTimeline({
      kind: "NOTE",
      summary: "Correction: April, not March",
      clientId: client.id,
    });

    const entries = await readTimeline({ clientId: client.id });
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.summary)).toContain(
      "Said the budget lands in March",
    );
  });
});

describe("what an entry records", () => {
  beforeEach(resetDb);

  it("keeps the author, and keeps the text after they leave", async () => {
    const user = await makeUser({ name: "Dana Reed" });
    const client = await makeClient();

    await recordTimeline({
      kind: "CALL",
      summary: "Half an hour on the phone about the launch date",
      userId: user.id,
      clientId: client.id,
    });

    const [before] = await readTimeline({ clientId: client.id });
    expect(before!.user?.name).toBe("Dana Reed");
    expect(before!.actorKind).toBe("HUMAN");

    await db.user.delete({ where: { id: user.id } });

    const [after] = await readTimeline({ clientId: client.id });
    expect(after!.summary).toBe(
      "Half an hour on the phone about the launch date",
    );
    expect(after!.user).toBeNull();
  });

  it("marks an entry the tracker filed as one", async () => {
    const request = await makeRequest();

    await recordTimeline({
      kind: "SYSTEM",
      summary: "Filed from a reply",
      actorKind: "MACHINE",
      requestId: request.id,
    });

    const [entry] = await readTimeline({ requestId: request.id });
    expect(entry!.actorKind).toBe("MACHINE");
    expect(entry!.userId).toBeNull();
  });

  it("defaults to a person, so a forgotten actorKind never reads as machine", async () => {
    const client = await makeClient();
    await recordTimeline({ kind: "NOTE", summary: "x", clientId: client.id });

    const [entry] = await readTimeline({ clientId: client.id });
    expect(entry!.actorKind).toBe("HUMAN");
  });
});

describe("order", () => {
  beforeEach(resetDb);

  it("puts pinned entries first, then the newest", async () => {
    const client = await makeClient();

    const old = await recordTimeline({
      kind: "NOTE",
      summary: "oldest",
      clientId: client.id,
    });
    await recordTimeline({ kind: "NOTE", summary: "newest", clientId: client.id });
    // Pin the oldest one, so "pinned first" and "newest first" disagree and
    // the test is actually about which of the two wins.
    await db.timelineEntry.update({
      where: { id: old.id },
      data: { isPinned: true },
    });

    const entries = await readTimeline({ clientId: client.id });
    expect(entries.map((e) => e.summary)).toEqual(["oldest", "newest"]);
  });
});

describe("what a diary is attached to", () => {
  beforeEach(resetDb);

  it("goes when the request goes", async () => {
    const request = await makeRequest();
    await recordTimeline({
      kind: "STATUS",
      summary: describeStatusChange("NEW", "IN_REVIEW"),
      requestId: request.id,
    });

    await db.clientRequest.delete({ where: { id: request.id } });
    expect(await db.timelineEntry.count()).toBe(0);
  });

  it("goes when the client goes", async () => {
    const client = await makeClient();
    await recordTimeline({ kind: "NOTE", summary: "x", clientId: client.id });

    await db.client.delete({ where: { id: client.id } });
    expect(await db.timelineEntry.count()).toBe(0);
  });

  it("keeps a request's diary separate from its client's", async () => {
    const client = await makeClient();
    const request = await makeRequest(client.id);

    await recordTimeline({ kind: "NOTE", summary: "on the client", clientId: client.id });
    await recordTimeline({ kind: "NOTE", summary: "on the request", requestId: request.id });

    expect((await readTimeline({ clientId: client.id })).map((e) => e.summary))
      .toEqual(["on the client"]);
    expect((await readTimeline({ requestId: request.id })).map((e) => e.summary))
      .toEqual(["on the request"]);
  });

  it("returns nothing when asked about nothing", async () => {
    expect(await readTimeline({})).toEqual([]);
  });
});

describe("the sentence a status change leaves", () => {
  it("uses the labels a reader sees on screen", () => {
    expect(describeStatusChange("NEW", "IN_REVIEW")).toBe(
      "Status: New → In review",
    );
    expect(describeStatusChange("ACCEPTED", "CONVERTED")).toBe(
      "Status: Accepted → Converted",
    );
  });

  it("falls back to the raw value rather than printing nothing", () => {
    // The text is stored, not resolved on read, so an enum value that no
    // longer has a label still has to produce a readable line.
    expect(describeStatusChange("NEW", "SOMETHING_ELSE")).toBe(
      "Status: New → SOMETHING_ELSE",
    );
  });
});
