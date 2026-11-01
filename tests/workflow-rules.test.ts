import { describe, expect, it } from "vitest";

import {
  checkConditions,
  describeConditions,
  describeHooks,
  EMPTY_CONDITIONS,
  hasHooks,
  isSafeWebhookUrl,
  parseConditions,
  parseHooks,
  type TransitionContext,
} from "../lib/workflow-rules";

const ctx = (
  overrides: Partial<TransitionContext["ticket"]> = {},
  role = "MEMBER",
  actorId = "u1",
): TransitionContext => ({
  actor: { id: actorId, role },
  ticket: {
    assigneeId: null,
    estimate: null,
    description: null,
    acceptance: null,
    commentCount: 0,
    visitedStatusIds: [],
    ...overrides,
  },
});

describe("parseConditions", () => {
  it("returns a safe default for junk in the column", () => {
    for (const junk of [null, undefined, 42, "nope", []]) {
      expect(parseConditions(junk)).toEqual(EMPTY_CONDITIONS);
    }
  });

  it("keeps only known roles", () => {
    const parsed = parseConditions({ roles: ["ADMIN", "CLIENT", "WIZARD", 7] });
    expect(parsed.roles).toEqual(["ADMIN"]);
  });

  it("coerces non-boolean flags rather than trusting them", () => {
    const parsed = parseConditions({ assigneeOnly: "yes", requireEstimate: 1 });
    expect(parsed.assigneeOnly).toBe(false);
    expect(parsed.requireEstimate).toBe(false);
  });
});

describe("parseHooks", () => {
  it("drops an unknown priority", () => {
    expect(parseHooks({ setPriority: "CRITICAL" }).setPriority).toBeNull();
    expect(parseHooks({ setPriority: "HIGH" }).setPriority).toBe("HIGH");
  });

  it("keeps client visibility tri-state", () => {
    expect(parseHooks({}).setClientVisible).toBeNull();
    expect(parseHooks({ setClientVisible: false }).setClientVisible).toBe(
      false,
    );
    expect(parseHooks({ setClientVisible: true }).setClientVisible).toBe(true);
  });

  it("rejects a webhook that isn't http(s)", () => {
    expect(
      parseHooks({ webhookUrl: "javascript:alert(1)" }).webhookUrl,
    ).toBeNull();
    expect(
      parseHooks({ webhookUrl: "file:///etc/passwd" }).webhookUrl,
    ).toBeNull();
    expect(parseHooks({ webhookUrl: "not a url" }).webhookUrl).toBeNull();
    expect(parseHooks({ webhookUrl: "https://example.com/h" }).webhookUrl).toBe(
      "https://example.com/h",
    );
  });

  it("treats a blank comment as no comment", () => {
    expect(parseHooks({ postComment: "   " }).postComment).toBeNull();
    expect(parseHooks({ postComment: " hi " }).postComment).toBe("hi");
  });

  it("knows when nothing is configured", () => {
    expect(hasHooks(parseHooks({}))).toBe(false);
    expect(hasHooks(parseHooks({ notifyChat: true }))).toBe(true);
  });
});

describe("isSafeWebhookUrl", () => {
  it("allows only http and https", () => {
    expect(isSafeWebhookUrl("http://a.b")).toBe(true);
    expect(isSafeWebhookUrl("https://a.b")).toBe(true);
    expect(isSafeWebhookUrl("ftp://a.b")).toBe(false);
    expect(isSafeWebhookUrl("")).toBe(false);
  });
});

describe("checkConditions", () => {
  it("lets everything through when nothing is set", () => {
    expect(checkConditions(EMPTY_CONDITIONS, ctx())).toBeNull();
  });

  it("limits the arrow by role", () => {
    const c = parseConditions({ roles: ["ADMIN", "MANAGER"] });
    expect(checkConditions(c, ctx({}, "MEMBER"))).toMatch(/limited to/i);
    expect(checkConditions(c, ctx({}, "MANAGER"))).toBeNull();
  });

  it("restricts to the assignee", () => {
    const c = parseConditions({ assigneeOnly: true });
    expect(
      checkConditions(c, ctx({ assigneeId: "u2" }, "MEMBER", "u1")),
    ).toMatch(/assignee/i);
    expect(
      checkConditions(c, ctx({ assigneeId: "u1" }, "MEMBER", "u1")),
    ).toBeNull();
  });

  it("requires an assignee, an estimate, a description and a comment", () => {
    const c = parseConditions({
      requireAssignee: true,
      requireEstimate: true,
      requireDescription: true,
      requireComment: true,
    });

    expect(checkConditions(c, ctx())).toMatch(/assign the ticket/i);
    expect(checkConditions(c, ctx({ assigneeId: "u1" }))).toMatch(/estimate/i);
    expect(checkConditions(c, ctx({ assigneeId: "u1", estimate: 3 }))).toMatch(
      /description/i,
    );
    expect(
      checkConditions(
        c,
        ctx({ assigneeId: "u1", estimate: 3, description: "text" }),
      ),
    ).toMatch(/comment/i);
    expect(
      checkConditions(
        c,
        ctx({
          assigneeId: "u1",
          estimate: 3,
          description: "text",
          commentCount: 1,
        }),
      ),
    ).toBeNull();
  });

  it("treats a zero estimate and a blank description as missing", () => {
    expect(
      checkConditions(
        parseConditions({ requireEstimate: true }),
        ctx({ estimate: 0 }),
      ),
    ).toMatch(/estimate/i);
    expect(
      checkConditions(
        parseConditions({ requireDescription: true }),
        ctx({ description: "   " }),
      ),
    ).toMatch(/description/i);
  });

  it("reports the identity problem before the missing-field one", () => {
    const c = parseConditions({ roles: ["ADMIN"], requireEstimate: true });
    expect(checkConditions(c, ctx({}, "MEMBER"))).toMatch(/limited to/i);
  });
});

describe("descriptions for the canvas", () => {
  it("summarises what an arrow carries", () => {
    expect(
      describeConditions(
        parseConditions({ roles: ["ADMIN"], assigneeOnly: true }),
      ),
    ).toEqual(["admin", "assignee only"]);

    expect(
      describeHooks(parseHooks({ setPriority: "HIGH", notifyChat: true })),
    ).toEqual(["priority → high", "notify chat"]);
  });

  it("says nothing when nothing is configured", () => {
    expect(describeConditions(parseConditions({}))).toEqual([]);
    expect(describeHooks(parseHooks({}))).toEqual([]);
  });
});

describe("a shortcut that skips a step", () => {
  const skipQa = {
    ...EMPTY_CONDITIONS,
    requireVisitedStatusId: "status-qa",
  };

  it("is closed to a ticket that has never been through it", () => {
    // The first pass has to take the long way round.
    expect(checkConditions(skipQa, ctx({ visitedStatusIds: [] }))).toBeTruthy();
    expect(
      checkConditions(skipQa, ctx({ visitedStatusIds: ["status-dev"] })),
    ).toBeTruthy();
  });

  it("opens once it has", () => {
    expect(
      checkConditions(
        skipQa,
        ctx({ visitedStatusIds: ["status-dev", "status-qa"] }),
      ),
    ).toBeNull();
  });

  it("is simply absent when no status is named", () => {
    expect(
      checkConditions(EMPTY_CONDITIONS, ctx({ visitedStatusIds: [] })),
    ).toBeNull();
  });

  it("survives a round trip through storage", () => {
    const parsed = parseConditions({ requireVisitedStatusId: "status-qa" });
    expect(parsed.requireVisitedStatusId).toBe("status-qa");

    // An empty select posts an empty string, which is not a requirement.
    expect(
      parseConditions({ requireVisitedStatusId: "" }).requireVisitedStatusId,
    ).toBeNull();
    expect(parseConditions({}).requireVisitedStatusId).toBeNull();
  });

  it("names the step it waits for, when the caller can resolve it", () => {
    const names: Record<string, string> = { "status-qa": "QA" };

    expect(describeConditions(skipQa, (id) => names[id])).toContain(
      "only after QA",
    );
    // Without a resolver it stays vague rather than printing a cuid.
    expect(describeConditions(skipQa).join(" ")).not.toContain("status-qa");
  });
});
