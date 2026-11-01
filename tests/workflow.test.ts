import { beforeEach, describe, expect, it } from "vitest";

import {
  allowedTargets,
  findTransition,
  isTransitionAllowed,
  remapStatus,
  transitionMap,
} from "../lib/workflow";
import { moveTicket } from "../lib/ticket-ops";
import {
  asSessionUser,
  db,
  makeProject,
  makeTicket,
  makeUser,
  makeWorkflow,
  resetDb,
} from "./setup/db";

describe("workflow transitions", () => {
  let workflow: Awaited<ReturnType<typeof makeWorkflow>>;
  let todo: string;
  let doing: string;
  let done: string;

  beforeEach(async () => {
    await resetDb();
    workflow = await makeWorkflow([
      { name: "To do", category: "TODO" },
      { name: "Doing", category: "IN_PROGRESS" },
      { name: "Done", category: "DONE" },
    ]);
    [todo, doing, done] = workflow.statuses.map((s) => s.id) as [
      string,
      string,
      string,
    ];
  });

  it("allows anything when no transitions are defined", async () => {
    expect(await isTransitionAllowed(workflow.id, todo, done)).toBe(true);
    expect(await isTransitionAllowed(workflow.id, done, todo)).toBe(true);

    const targets = await allowedTargets(workflow.id, todo);
    expect(targets.map((t) => t.id)).toEqual([doing, done]);
  });

  it("allows only declared moves once transitions exist", async () => {
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: todo,
        toStatusId: doing,
        name: "Start",
      },
    });

    expect(await isTransitionAllowed(workflow.id, todo, doing)).toBe(true);
    expect(await isTransitionAllowed(workflow.id, todo, done)).toBe(false);
    expect(await isTransitionAllowed(workflow.id, doing, todo)).toBe(false);

    const targets = await allowedTargets(workflow.id, todo);
    expect(targets.map((t) => t.id)).toEqual([doing]);
  });

  it("treats a null source as 'from any status'", async () => {
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: null,
        toStatusId: todo,
        name: "Back to the top",
      },
    });

    expect(await isTransitionAllowed(workflow.id, doing, todo)).toBe(true);
    expect(await isTransitionAllowed(workflow.id, done, todo)).toBe(true);
    // The global transition doesn't unlock unrelated moves.
    expect(await isTransitionAllowed(workflow.id, todo, done)).toBe(false);
  });

  it("always permits a no-op move to the same status", async () => {
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: todo,
        toStatusId: doing,
        name: "Start",
      },
    });
    expect(await isTransitionAllowed(workflow.id, done, done)).toBe(true);
  });

  it("never offers the current status as a target", async () => {
    const targets = await allowedTargets(workflow.id, doing);
    expect(targets.map((t) => t.id)).not.toContain(doing);
  });

  it("prefers the specific arrow over the catch-all when both fit", async () => {
    const specific = await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: todo,
        toStatusId: done,
        name: "Straight to done",
        conditions: { requireEstimate: true },
      },
    });
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: null,
        toStatusId: done,
        name: "Anything to done",
      },
    });

    // Otherwise a catch-all arrow would quietly disable a targeted rule.
    const chosen = await findTransition(workflow.id, todo, done);
    expect(chosen?.id).toBe(specific.id);

    const fallback = await findTransition(workflow.id, doing, done);
    expect(fallback?.fromStatusId).toBeNull();
  });

  it("returns nothing when no arrow covers the move", async () => {
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: todo,
        toStatusId: doing,
        name: "Start",
      },
    });
    expect(await findTransition(workflow.id, doing, done)).toBeNull();
  });

  it("builds a map the board can use for every status", async () => {
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: todo,
        toStatusId: doing,
        name: "Start",
      },
    });

    const map = await transitionMap(workflow.id);
    expect(Object.keys(map)).toHaveLength(3);
    expect(map[todo]).toContain(doing);
    // Own status is included so dropping a card back where it was is a no-op.
    expect(map[todo]).toContain(todo);
    expect(map[doing]).toEqual([doing]);
  });
});

describe("a ticket's own history", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function project() {
    const workflow = await makeWorkflow([
      { name: "To do", category: "TODO" },
      { name: "In development", category: "IN_PROGRESS" },
      { name: "QA", category: "IN_PROGRESS" },
      { name: "Done", category: "DONE" },
    ]);
    const person = await makeUser({ role: "MANAGER" });
    const p = await makeProject({ workflowId: workflow.id, status: "ACTIVE" });
    const ticket = await makeTicket(p.id, workflow.statuses[0]!.id);
    const actor = asSessionUser(person);
    const s = (i: number) => workflow.statuses[i]!;

    // Every arrow of the chain, plus the shortcut that skips QA.
    for (let i = 0; i < 3; i++) {
      await db.workflowTransition.create({
        data: {
          workflowId: workflow.id,
          fromStatusId: s(i).id,
          toStatusId: s(i + 1).id,
          name: "next",
        },
      });
    }
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: s(2).id,
        toStatusId: s(1).id,
        name: "back to development",
      },
    });

    return { workflow, ticket, actor, s };
  }

  it("records every move it makes", async () => {
    const { ticket, actor, s } = await project();

    await moveTicket({ ticketId: ticket.id, toStatusId: s(1).id, actor });
    await moveTicket({ ticketId: ticket.id, toStatusId: s(2).id, actor });

    const history = await db.ticketStatusChange.findMany({
      where: { ticketId: ticket.id },
      orderBy: { createdAt: "asc" },
    });

    expect(history.map((h) => h.toStatusName)).toEqual([
      "In development",
      "QA",
    ]);
    // The name is copied, so renaming the status later cannot rewrite this.
    expect(history[1]!.fromStatusId).toBe(s(1).id);
  });

  it("keeps the shortcut shut until the step has been taken once", async () => {
    const { workflow, ticket, actor, s } = await project();

    // Straight from development to done, but only for a ticket that has
    // already been through QA.
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: s(1).id,
        toStatusId: s(3).id,
        name: "skip QA",
        conditions: { requireVisitedStatusId: s(2).id },
      },
    });

    await moveTicket({ ticketId: ticket.id, toStatusId: s(1).id, actor });

    await expect(
      moveTicket({ ticketId: ticket.id, toStatusId: s(3).id, actor }),
    ).rejects.toThrow(/been through QA/i);
  });

  it("opens it once the ticket has come back round", async () => {
    const { workflow, ticket, actor, s } = await project();
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: s(1).id,
        toStatusId: s(3).id,
        name: "skip QA",
        conditions: { requireVisitedStatusId: s(2).id },
      },
    });

    // The long way round the first time…
    await moveTicket({ ticketId: ticket.id, toStatusId: s(1).id, actor });
    await moveTicket({ ticketId: ticket.id, toStatusId: s(2).id, actor });
    // …sent back for changes…
    await moveTicket({ ticketId: ticket.id, toStatusId: s(1).id, actor });

    // …and now the second pass may skip the step it has already taken.
    const moved = await moveTicket({
      ticketId: ticket.id,
      toStatusId: s(3).id,
      actor,
    });
    expect(moved.to).toBe("Done");
  });

  it("lets a ticket jump backwards several steps when an arrow says so", async () => {
    const { workflow, ticket, actor, s } = await project();
    await db.workflowTransition.create({
      data: {
        workflowId: workflow.id,
        fromStatusId: s(3).id,
        toStatusId: s(0).id,
        name: "reopen",
      },
    });

    await moveTicket({ ticketId: ticket.id, toStatusId: s(1).id, actor });
    await moveTicket({ ticketId: ticket.id, toStatusId: s(2).id, actor });
    await moveTicket({ ticketId: ticket.id, toStatusId: s(3).id, actor });

    const back = await moveTicket({
      ticketId: ticket.id,
      toStatusId: s(0).id,
      actor,
    });
    expect(back.to).toBe("To do");
  });
});

/**
 * Switching a project to another workflow moves every ticket on it at once.
 * The rule that decides where each one lands is worth holding still.
 */
describe("moving a project to a different workflow", () => {
  const TARGET = [
    { id: "t1", name: "Backlog", category: "TODO" },
    { id: "t2", name: "Doing", category: "IN_PROGRESS" },
    { id: "t3", name: "QA", category: "IN_PROGRESS" },
    { id: "t4", name: "Shipped", category: "DONE" },
  ];
  const INITIAL = TARGET[0]!;

  it("keeps a ticket in a status of the same name", () => {
    const landed = remapStatus(
      { name: "QA", category: "DONE" },
      TARGET,
      INITIAL,
    );
    // Name wins over category: a "QA" in both workflows means the same thing
    // to the people using it, whatever it is filed under.
    expect(landed.id).toBe("t3");
  });

  it("falls back to the first status of the same category", () => {
    const landed = remapStatus(
      { name: "In development", category: "IN_PROGRESS" },
      TARGET,
      INITIAL,
    );
    expect(landed.id).toBe("t2");
  });

  it("puts a ticket with nothing to match on at the start", () => {
    const landed = remapStatus(
      { name: "Waiting on legal", category: "BLOCKED" },
      TARGET,
      INITIAL,
    );
    expect(landed.id).toBe("t1");
  });

  it("never leaves a ticket pointing at its old workflow", () => {
    // Whatever it was, it lands on something in the new set — the failure
    // that would matter here is a ticket left on a status the project no
    // longer has, which is a board that cannot render.
    const anything = [
      { name: "Done", category: "DONE" },
      { name: "Nonsense", category: "NOPE" },
      { name: "Backlog", category: "TODO" },
    ];
    for (const from of anything) {
      expect(TARGET).toContain(remapStatus(from, TARGET, INITIAL));
    }
  });
});
