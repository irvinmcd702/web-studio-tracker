import { describe, expect, it } from "vitest";

import { buildTicketPrompt } from "../lib/ticket-prompt";
import { checkConditions, EMPTY_CONDITIONS } from "../lib/workflow-rules";

const ticket = {
  number: 4,
  title: "Delivery address is lost on mobile",
  description: "Safari iOS 17 drops the value after the payment step.",
  acceptance: "- [ ] Survives the keyboard closing\n- [ ] Covered by a test",
  type: "BUG",
  priority: "URGENT",
  estimate: 4,
  dueDate: new Date("2026-08-15T12:00:00Z"),
  status: { name: "QA" },
  assignee: { name: "Arthur Levine" },
  project: {
    key: "ACME",
    name: "Acme online store",
    description: "Catalogue, cart, Stripe checkout.",
    client: { name: "Acme Inc." },
  },
};

const build = (
  overrides: Partial<Record<keyof typeof ticket, unknown>> = {},
  transitions = [],
) =>
  buildTicketPrompt({
    ticket: { ...ticket, ...overrides } as never,
    transitions,
    appUrl: "http://localhost:3210",
  });

describe("buildTicketPrompt", () => {
  it("leads with the key, the title and what done means", () => {
    const prompt = build();

    expect(prompt).toContain("# ACME-4 · Delivery address is lost on mobile");
    expect(prompt).toContain("Bug · Urgent · status: QA");
    expect(prompt).toContain("## Done means");
    expect(prompt).toContain("- [ ] Covered by a test");
  });

  it("says plainly when nobody wrote the criteria, instead of inventing them", () => {
    const prompt = build({ acceptance: null });

    expect(prompt).toContain("No acceptance criteria written yet");
    expect(prompt).toContain("do not invent them");
  });

  it("points at the project context rather than inlining every document", () => {
    const prompt = build();

    expect(prompt).toContain(
      "GET http://localhost:3210/api/v1/projects/ACME/context",
    );
    expect(prompt).toContain("project_context");
  });

  it("lists the legal moves with what each one requires", () => {
    const prompt = build({}, [
      { to: "Code review", requires: [] },
      { to: "Done", requires: ["admin/manager"] },
    ] as never);

    expect(prompt).toContain('{"to": "Code review"}');
    expect(prompt).toContain('{"to": "Done"}   — requires admin/manager');
    expect(prompt).toContain("don't retry blindly");
  });

  it("tells the agent to report back on the ticket and not hide its hours", () => {
    const prompt = build();

    expect(prompt).toContain("/api/v1/tickets/ACME-4/comments");
    expect(prompt).toContain("/api/v1/tickets/ACME-4/worklog");
    expect(prompt).toContain("recorded as agent work");
  });
});

describe("requireAcceptance condition", () => {
  const ctx = (acceptance: string | null) => ({
    actor: { id: "u1", role: "MEMBER" },
    ticket: {
      assigneeId: null,
      estimate: null,
      description: null,
      acceptance,
      commentCount: 0,
      visitedStatusIds: [],
    },
  });

  it("blocks the move until the criteria are written", () => {
    const conditions = { ...EMPTY_CONDITIONS, requireAcceptance: true };

    expect(checkConditions(conditions, ctx(null))).toMatch(/acceptance/i);
    expect(checkConditions(conditions, ctx("   "))).toMatch(/acceptance/i);
    expect(checkConditions(conditions, ctx("- [ ] works"))).toBeNull();
  });

  it("stays out of the way when it isn't switched on", () => {
    expect(checkConditions(EMPTY_CONDITIONS, ctx(null))).toBeNull();
  });
});
