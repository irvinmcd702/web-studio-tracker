import { beforeAll, describe, expect, it } from "vitest";

import {
  authenticateToken,
  canWrite,
  hashToken,
  issueApiToken,
} from "../lib/api-tokens";
import { resolveTicket } from "../lib/api-tickets";
import { moveTicket, logWork, TicketOpError } from "../lib/ticket-ops";
import { parseTicketKey } from "../lib/api-serialise";
import { projectBudget } from "../lib/budget";
import {
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

/**
 * The API is the surface an agent writes to unattended, so the tests are about
 * what it must refuse: an unknown or dead token, a read-only token trying to
 * change something, and a token reaching a project its owner cannot open.
 */
describe("api tokens", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    await resetDb();
    owner = await makeUser({ role: "MEMBER" });
  });

  const bearer = (token: string) => `Bearer ${token}`;

  it("stores only a hash of the token", async () => {
    const { token, record } = await issueApiToken({
      userId: owner.id,
      name: "hash check",
      kind: "AGENT",
      scopes: ["READ"],
    });

    expect(record.tokenHash).toBe(hashToken(token));
    expect(record.tokenHash).not.toContain(token);
    // Enough to recognise the row, far too little to rebuild the secret.
    expect(token.startsWith(record.prefix)).toBe(true);
    expect(record.prefix.length).toBeLessThan(token.length / 2);
  });

  it("resolves a live token to the person who issued it", async () => {
    const { token } = await issueApiToken({
      userId: owner.id,
      name: "live",
      kind: "AGENT",
      scopes: ["READ", "WRITE"],
    });

    const result = await authenticateToken(bearer(token));
    expect("actor" in result).toBe(true);
    if ("actor" in result) {
      expect(result.actor.id).toBe(owner.id);
      expect(result.actor.token.kind).toBe("AGENT");
      expect(canWrite(result.actor)).toBe(true);
    }
  });

  it("refuses a missing, malformed or unknown token", async () => {
    expect(await authenticateToken(null)).toEqual({ error: "missing" });
    expect(await authenticateToken("Token abc")).toEqual({
      error: "malformed",
    });
    expect(await authenticateToken("Bearer nope")).toEqual({
      error: "malformed",
    });
    expect(await authenticateToken(bearer("stk_nonexistent"))).toEqual({
      error: "unknown",
    });
  });

  it("refuses a revoked token", async () => {
    const { token, record } = await issueApiToken({
      userId: owner.id,
      name: "revoked",
      kind: "AGENT",
      scopes: ["READ"],
    });
    await db.apiToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    expect(await authenticateToken(bearer(token))).toEqual({
      error: "revoked",
    });
  });

  it("refuses an expired token", async () => {
    const { token } = await issueApiToken({
      userId: owner.id,
      name: "expired",
      kind: "AGENT",
      scopes: ["READ"],
      expiresAt: new Date(Date.now() - 1000),
    });

    expect(await authenticateToken(bearer(token))).toEqual({
      error: "expired",
    });
  });

  it("refuses a token whose owner was deactivated", async () => {
    const leaver = await makeUser({ role: "MEMBER", isActive: false });
    const { token } = await issueApiToken({
      userId: leaver.id,
      name: "gone",
      kind: "AGENT",
      scopes: ["READ"],
    });

    expect(await authenticateToken(bearer(token))).toEqual({
      error: "inactive",
    });
  });

  it("refuses a client account outright", async () => {
    const client = await db.client.create({ data: { name: "Acme" } });
    const portalUser = await makeUser({ role: "CLIENT", clientId: client.id });
    const { token } = await issueApiToken({
      userId: portalUser.id,
      name: "portal",
      kind: "PERSONAL",
      scopes: ["READ"],
    });

    expect(await authenticateToken(bearer(token))).toEqual({
      error: "forbidden_role",
    });
  });

  it("does not grant write to a read-only token", async () => {
    const { token } = await issueApiToken({
      userId: owner.id,
      name: "reader",
      kind: "AGENT",
      scopes: ["READ"],
    });

    const result = await authenticateToken(bearer(token));
    expect("actor" in result && canWrite(result.actor)).toBe(false);
  });
});

describe("ticket keys", () => {
  it("parses the key people actually paste", () => {
    expect(parseTicketKey("ACME-14")).toEqual({
      projectKey: "ACME",
      number: 14,
    });
    expect(parseTicketKey(" acme-14 ")).toEqual({
      projectKey: "acme",
      number: 14,
    });
    expect(parseTicketKey("ACME 14")).toBeNull();
    expect(parseTicketKey("14")).toBeNull();
    expect(parseTicketKey("")).toBeNull();
  });
});

describe("api ticket lookup", () => {
  it("never resolves a ticket outside the token owner's projects", async () => {
    await resetDb();

    const member = await makeUser({ role: "MEMBER" });
    const stranger = await makeUser({ role: "MEMBER" });
    const workflow = await makeWorkflow();

    const project = await makeProject({
      workflowId: workflow.id,
      key: "ACME",
      managerId: member.id,
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);

    const mine = await resolveTicket(member as never, `ACME-${ticket.number}`);
    expect("ticket" in mine).toBe(true);

    // The stranger is on no crew, manages nothing and holds no ticket here.
    const theirs = await resolveTicket(
      stranger as never,
      `ACME-${ticket.number}`,
    );
    expect(theirs).toEqual({ error: "not_found" });

    expect(await resolveTicket(member as never, "nonsense")).toEqual({
      error: "bad_key",
    });
  });
});

describe("ticket operations through the API", () => {
  it("applies the same workflow conditions as the UI", async () => {
    await resetDb();

    const member = await makeUser({ role: "MEMBER" });
    const workflow = await makeWorkflow();
    const [todo, doing] = workflow.statuses;

    const project = await makeProject({
      workflowId: workflow.id,
      managerId: member.id,
    });
    const ticket = await makeTicket(project.id, todo!.id);

    // Only admins and managers may use this arrow.
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: todo!.id,
        toStatusId: doing!.id,
        name: "Start",
        conditions: { roles: ["ADMIN", "MANAGER"] },
      },
    });

    await expect(
      moveTicket({
        ticketId: ticket.id,
        toStatusId: doing!.id,
        actor: member as never,
      }),
    ).rejects.toBeInstanceOf(TicketOpError);

    const after = await db.ticket.findUnique({ where: { id: ticket.id } });
    expect(after?.statusId).toBe(todo!.id);
  });

  it("marks agent hours as agent work", async () => {
    await resetDb();

    const member = await makeUser({ role: "MEMBER" });
    const workflow = await makeWorkflow();
    const project = await makeProject({
      workflowId: workflow.id,
      managerId: member.id,
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);

    await logWork({
      ticketId: ticket.id,
      hours: 2,
      actor: member as never,
      source: "AGENT",
    });
    await logWork({
      ticketId: ticket.id,
      hours: 1,
      actor: member as never,
    });

    const entries = await db.workLog.findMany({
      where: { ticketId: ticket.id },
      orderBy: { hours: "desc" },
    });

    expect(entries.map((e) => [e.hours, e.source])).toEqual([
      [2, "AGENT"],
      [1, "HUMAN"],
    ]);
  });

  it("refuses to write into a project the actor cannot access", async () => {
    await resetDb();

    const outsider = await makeUser({ role: "MEMBER" });
    const workflow = await makeWorkflow();
    const project = await makeProject({ workflowId: workflow.id });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);

    await expect(
      logWork({ ticketId: ticket.id, hours: 1, actor: outsider as never }),
    ).rejects.toThrow(/not accessible/i);
  });
});

/**
 * Recording who did the work and showing it are two different things. The
 * first is a fact and always happens; the second is a decision the studio
 * makes once for itself, and again per project for the client.
 */
describe("agent hours", () => {
  it("counts agent time into the budget without hiding it from the total", async () => {
    await resetDb();

    const member = await makeUser({ role: "MEMBER" });
    const workflow = await makeWorkflow();
    const project = await makeProject({
      workflowId: workflow.id,
      managerId: member.id,
      budgetType: "HOURLY",
      budgetHours: 40,
      hourlyRate: 100,
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);

    await logWork({ ticketId: ticket.id, hours: 3, actor: member as never });
    await logWork({
      ticketId: ticket.id,
      hours: 2,
      actor: member as never,
      source: "AGENT",
    });

    const fresh = await db.project.findUniqueOrThrow({
      where: { id: project.id },
    });
    const budget = await projectBudget(fresh);

    // The client is billed for five hours either way: the split is information,
    // not a discount.
    expect(budget.spentHours).toBe(5);
    expect(budget.agentHours).toBe(2);
    expect(budget.spentAmount).toBe(500);
  });

  it("reports zero agent hours for a project nobody used an agent on", async () => {
    await resetDb();

    const member = await makeUser({ role: "MEMBER" });
    const workflow = await makeWorkflow();
    const project = await makeProject({
      workflowId: workflow.id,
      managerId: member.id,
    });
    const ticket = await makeTicket(project.id, workflow.statuses[0]!.id);

    await logWork({ ticketId: ticket.id, hours: 4, actor: member as never });

    const fresh = await db.project.findUniqueOrThrow({
      where: { id: project.id },
    });
    expect((await projectBudget(fresh)).agentHours).toBe(0);
  });
});
