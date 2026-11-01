import { beforeEach, describe, expect, it } from "vitest";

import {
  excerptAround,
  markMentionsRead,
  mentionableOn,
  parseHandles,
  recordMentions,
  splitMentions,
  unreadMentions,
} from "../lib/mentions";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

describe("finding handles in what was written", () => {
  it("picks them out of ordinary prose", () => {
    expect(parseHandles("@dana can you look? cc @sam")).toEqual([
      "dana",
      "sam",
    ]);
  });

  it("does not swallow the punctuation after one", () => {
    expect(parseHandles("ask @dana.")).toEqual(["dana"]);
    expect(parseHandles("@dana, @sam and @lea!")).toEqual([
      "dana",
      "sam",
      "lea",
    ]);
  });

  it("ignores email addresses", () => {
    // The @ in an address is not a mention, whatever follows it.
    expect(parseHandles("write to dana@studio.com about it")).toEqual([]);
  });

  it("mentions each person once however often they are named", () => {
    expect(parseHandles("@dana @dana @DANA")).toEqual(["dana"]);
  });

  it("finds nothing in a body with no mentions", () => {
    expect(parseHandles("no mentions here at all")).toEqual([]);
  });
});

describe("who can be named", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const workflow = await makeWorkflow();
    const pm = await makeUser({ role: "MANAGER", handle: "maria" });
    const onCrew = await makeUser({ handle: "dana" });
    const elsewhere = await makeUser({ handle: "ivan" });
    // A manager of the studio with nothing to do with this project.
    const otherManager = await makeUser({ role: "MANAGER", handle: "tom" });
    const client = await db.client.create({ data: { name: "Acme" } });
    const portal = await makeUser({
      role: "CLIENT",
      handle: "john",
      clientId: client.id,
    });
    const project = await makeProject({
      workflowId: workflow.id,
      managerId: pm.id,
      status: "ACTIVE",
    });
    await db.projectMember.create({
      data: { projectId: project.id, userId: onCrew.id },
    });
    return { workflow, project, pm, onCrew, elsewhere, portal, otherManager };
  }

  it("is the crew, the manager and anyone who sees every project", async () => {
    const { project, pm, onCrew } = await setup();

    const handles = (await mentionableOn(project.id)).map((p) => p.handle);

    expect(handles).toContain(pm.handle);
    expect(handles).toContain(onCrew.handle);
  });

  it("says who is on the project and who merely sees it", async () => {
    const { project, pm, onCrew, otherManager } = await setup();

    const by = new Map(
      (await mentionableOn(project.id)).map((p) => [p.handle, p.onProject]),
    );

    expect(by.get(onCrew.handle)).toBe(true);
    // The manager of this project belongs to it as much as its crew do.
    expect(by.get(pm.handle)).toBe(true);
    // A manager of the studio can read this project, so naming them has to
    // stay possible — but they are not on it, and the picker says so.
    expect(by.get(otherManager.handle)).toBe(false);
  });

  it("stops offering a studio manager once the project is closed", async () => {
    const { project, otherManager, onCrew } = await setup();
    await db.project.update({
      where: { id: project.id },
      data: { isConfidential: true },
    });

    const handles = (await mentionableOn(project.id)).map((p) => p.handle);

    // The excerpt travels with the mention. Naming somebody who cannot open
    // the ticket would post a piece of it to them.
    expect(handles).not.toContain(otherManager.handle);
    expect(handles).toContain(onCrew.handle);
  });

  it("offers somebody let into a closed project, as one of its people", async () => {
    const { project, otherManager } = await setup();
    await db.project.update({
      where: { id: project.id },
      data: { isConfidential: true },
    });
    await db.projectAccess.create({
      data: { projectId: project.id, userId: otherManager.id },
    });

    const found = (await mentionableOn(project.id)).find(
      (p) => p.handle === otherManager.handle,
    );

    expect(found).toBeDefined();
    // Let in by name is attachment to this project, not the run of the place.
    expect(found?.onProject).toBe(true);
  });

  it("does not record a mention of somebody a closed project shut out", async () => {
    const { project, otherManager, pm } = await setup();
    await db.project.update({
      where: { id: project.id },
      data: { isConfidential: true },
    });

    const told = await recordMentions({
      body: `@${otherManager.handle} have a look at this`,
      projectId: project.id,
      authorId: pm.id,
    });

    expect(told).toEqual([]);
    expect(await db.mention.count({ where: { userId: otherManager.id } })).toBe(
      0,
    );
  });

  it("is not somebody on another project", async () => {
    const { project, elsewhere } = await setup();

    const handles = (await mentionableOn(project.id)).map((p) => p.handle);

    expect(handles).not.toContain(elsewhere.handle);
  });

  it("is never a portal user", async () => {
    const { project, portal } = await setup();

    const handles = (await mentionableOn(project.id)).map((p) => p.handle);

    // They have no dashboard to see it on; a half-working notification is
    // worse than an honest absence.
    expect(handles).not.toContain(portal.handle);
  });
});

describe("recording a mention", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const workflow = await makeWorkflow();
    const author = await makeUser({ role: "MANAGER", handle: "maria" });
    const target = await makeUser({ handle: "dana" });
    const outsider = await makeUser({ handle: "ivan" });
    const project = await makeProject({
      workflowId: workflow.id,
      managerId: author.id,
      status: "ACTIVE",
    });
    await db.projectMember.create({
      data: { projectId: project.id, userId: target.id },
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);
    return { author, target, outsider, project, ticket };
  }

  it("creates one for somebody who can see the project", async () => {
    const { author, target, project, ticket } = await setup();

    const reached = await recordMentions({
      body: "@dana can you take a look before Friday?",
      projectId: project.id,
      ticketId: ticket.id,
      authorId: author.id,
    });

    expect(reached.map((p) => p.handle)).toEqual(["dana"]);

    const stored = await db.mention.findFirstOrThrow();
    expect(stored.userId).toBe(target.id);
    expect(stored.ticketId).toBe(ticket.id);
    expect(stored.readAt).toBeNull();
    expect(stored.excerpt).toContain("take a look before Friday");
  });

  it("creates nothing for somebody who cannot", async () => {
    const { author, project } = await setup();

    const reached = await recordMentions({
      body: "@ivan have a look",
      projectId: project.id,
      authorId: author.id,
    });

    // An excerpt is a piece of a client's ticket; naming a stranger must not
    // post it to them.
    expect(reached).toEqual([]);
    expect(await db.mention.count()).toBe(0);
  });

  it("does not notify somebody about their own message", async () => {
    const { author, project } = await setup();

    const reached = await recordMentions({
      body: "@maria is writing this",
      projectId: project.id,
      authorId: author.id,
    });

    expect(reached).toEqual([]);
  });

  it("is silent when nobody was named", async () => {
    const { author, project } = await setup();

    expect(
      await recordMentions({
        body: "just a normal comment",
        projectId: project.id,
        authorId: author.id,
      }),
    ).toEqual([]);
  });

  it("clears them when the person opens the ticket", async () => {
    const { author, target, project, ticket } = await setup();
    await recordMentions({
      body: "@dana look",
      projectId: project.id,
      ticketId: ticket.id,
      authorId: author.id,
    });

    expect(await unreadMentions(target.id)).toHaveLength(1);

    const cleared = await markMentionsRead({
      userId: target.id,
      ticketId: ticket.id,
    });

    expect(cleared).toBe(1);
    expect(await unreadMentions(target.id)).toHaveLength(0);
  });

  it("does not clear somebody else's", async () => {
    const { author, target, project, ticket } = await setup();
    await recordMentions({
      body: "@dana look",
      projectId: project.id,
      ticketId: ticket.id,
      authorId: author.id,
    });

    await markMentionsRead({ userId: author.id, ticketId: ticket.id });

    expect(await unreadMentions(target.id)).toHaveLength(1);
  });
});

describe("showing a mention in the text", () => {
  it("marks only the handles that resolved", () => {
    const parts = splitMentions("hi @dana and @nobody", new Set(["dana"]));

    expect(parts.filter((p) => p.mention).map((p) => p.text)).toEqual([
      "@dana",
    ]);
    expect(parts.map((p) => p.text).join("")).toBe("hi @dana and @nobody");
  });

  it("never loses a character of what was typed", () => {
    const body = "@dana: see the note, then ping @sam. Thanks!";
    const parts = splitMentions(body, new Set(["dana", "sam"]));
    expect(parts.map((p) => p.text).join("")).toBe(body);
  });
});

describe("the excerpt", () => {
  it("keeps a short body whole", () => {
    expect(excerptAround("@dana look at this", "dana")).toBe(
      "@dana look at this",
    );
  });

  it("trims around the mention in a long one", () => {
    const body = "x".repeat(300) + " @dana here " + "y".repeat(300);
    const out = excerptAround(body, "dana");

    expect(out.length).toBeLessThanOrEqual(142);
    expect(out).toContain("@dana");
  });
});
