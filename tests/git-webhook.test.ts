import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The route calls revalidatePath, which needs a Next request context that does
// not exist in a test process. Everything else in the route is real.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { POST } from "../app/api/git/webhook/route";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

const SECRET = "webhook-secret";

async function enableGit(overrides: Record<string, unknown> = {}) {
  await db.studioSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      gitEnabled: true,
      gitSecret: SECRET,
      ...overrides,
    },
    update: { gitEnabled: true, gitSecret: SECRET, ...overrides },
  });
}

function send(body: object, headers: Record<string, string> = {}) {
  const raw = JSON.stringify(body);
  const signature = `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;

  const request = new Request("http://localhost/api/git/webhook", {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-github-event": "pull_request",
      "x-hub-signature-256": signature,
      ...headers,
    },
  });

  return POST(request as never);
}

const pullRequest = (login: string, action = "opened", merged = false) => ({
  action,
  pull_request: {
    number: 7,
    merged,
    title: "ACME-1 keep the address",
    html_url: "https://github.com/studio/shop/pull/7",
    head: { ref: "acme-1-address" },
    user: { login },
  },
  sender: { login },
});

/**
 * The route, end to end against the real database. The pure parsing has its
 * own tests; what matters here is who the event is allowed to act as and that
 * the same delivery cannot be applied twice.
 */
describe("git webhook route", () => {
  let developer: Awaited<ReturnType<typeof makeUser>>;
  let manager: Awaited<ReturnType<typeof makeUser>>;
  let ticketId: string;
  let statuses: { id: string; name: string }[];

  beforeEach(async () => {
    await resetDb();

    developer = await makeUser({ role: "MEMBER", gitLogin: "arthur" });
    manager = await makeUser({ role: "MANAGER" });

    const workflow = await makeWorkflow([
      { name: "To do", category: "TODO" },
      { name: "Code review", category: "IN_PROGRESS" },
      { name: "Done", category: "DONE" },
    ]);
    statuses = workflow.statuses;

    const project = await makeProject({
      workflowId: workflow.id,
      key: "ACME",
      managerId: manager.id,
    });
    await db.projectMember.create({
      data: { projectId: project.id, userId: developer.id },
    });

    const ticket = await makeTicket(project.id, statuses[0]!.id);
    ticketId = ticket.id;
  });

  it("comments and moves when the pusher is a studio account", async () => {
    await enableGit({ gitStatusOnOpen: "Code review" });

    const response = await send(pullRequest("arthur"), {
      "x-github-delivery": "d-1",
    });
    const body = await response.json();

    expect(body.handled).toBe(true);
    expect(body.results[0].outcome).toContain("moved To do → Code review");

    const ticket = await db.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    expect(ticket.statusId).toBe(statuses[1]!.id);

    const comment = await db.ticketComment.findFirstOrThrow({
      where: { ticketId },
    });
    expect(comment.body).toContain("Pull request #7 opened");
    expect(comment.authorId).toBe(developer.id);
  });

  it("ignores a replay of the same delivery", async () => {
    await enableGit({ gitStatusOnOpen: "Code review" });

    await send(pullRequest("arthur"), { "x-github-delivery": "d-2" });
    const second = await send(pullRequest("arthur"), {
      "x-github-delivery": "d-2",
    });

    expect((await second.json()).handled).toBe(false);
    expect(await db.ticketComment.count({ where: { ticketId } })).toBe(1);
  });

  it("comments but never moves for a pusher nobody recognises", async () => {
    await enableGit({ gitStatusOnOpen: "Code review" });

    const response = await send(pullRequest("a-stranger"), {
      "x-github-delivery": "d-3",
    });
    const body = await response.json();

    expect(body.results[0].outcome).toContain("not moved");

    const ticket = await db.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    expect(ticket.statusId).toBe(statuses[0]!.id);

    // Attributed to the project manager, and the text names who actually pushed.
    const comment = await db.ticketComment.findFirstOrThrow({
      where: { ticketId },
    });
    expect(comment.authorId).toBe(manager.id);
    expect(comment.body).toContain("a-stranger");
  });

  it("obeys the workflow: a member cannot release by merging", async () => {
    await enableGit({ gitStatusOnMerge: "Done" });

    await db.workflowTransition.create({
      data: {
        workflowId: (
          await db.project.findFirstOrThrow({ where: { key: "ACME" } })
        ).workflowId,
        fromStatusId: statuses[0]!.id,
        toStatusId: statuses[2]!.id,
        name: "Release",
        conditions: { roles: ["ADMIN", "MANAGER"] },
      },
    });

    const response = await send(pullRequest("arthur", "closed", true), {
      "x-github-delivery": "d-4",
    });
    const body = await response.json();

    expect(body.results[0].outcome).toContain("This transition is limited to");

    const ticket = await db.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    expect(ticket.statusId).toBe(statuses[0]!.id);
  });

  it("refuses a payload signed with the wrong secret", async () => {
    await enableGit();

    const raw = JSON.stringify(pullRequest("arthur"));
    const request = new Request("http://localhost/api/git/webhook", {
      method: "POST",
      body: raw,
      headers: {
        "x-github-event": "pull_request",
        "x-hub-signature-256": `sha256=${createHmac("sha256", "wrong").update(raw).digest("hex")}`,
      },
    });

    const response = await POST(request as never);
    expect(response.status).toBe(401);
    expect(await db.ticketComment.count()).toBe(0);
  });

  it("answers 404 while the integration is switched off", async () => {
    await db.studioSettings.upsert({
      where: { id: "default" },
      create: { id: "default", gitEnabled: false },
      update: { gitEnabled: false },
    });

    const response = await send(pullRequest("arthur"), {
      "x-github-delivery": "d-5",
    });
    expect(response.status).toBe(404);
  });
});
