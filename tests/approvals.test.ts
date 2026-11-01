import { describe, expect, it } from "vitest";

import {
  approvalDecisionError,
  stageStateLabels,
  stageTrack,
} from "../lib/approvals";

const project = (portalShowApprovals = true) => ({ portalShowApprovals });

describe("approvalDecisionError", () => {
  describe("client", () => {
    const client = { role: "CLIENT" };

    it("may decide a stage that is awaiting them", () => {
      expect(
        approvalDecisionError(client, {
          status: "PENDING",
          project: project(),
        }),
      ).toBeNull();
    });

    it("may not decide when approvals are switched off for the portal", () => {
      expect(
        approvalDecisionError(client, {
          status: "PENDING",
          project: project(false),
        }),
      ).toMatch(/disabled/i);
    });

    it("may not touch a draft — it was never sent to them", () => {
      expect(
        approvalDecisionError(client, { status: "DRAFT", project: project() }),
      ).toMatch(/not awaiting/i);
    });

    it("may not decide twice", () => {
      for (const status of ["APPROVED", "CHANGES_REQUESTED"]) {
        expect(
          approvalDecisionError(client, { status, project: project() }),
        ).toMatch(/not awaiting/i);
      }
    });
  });

  describe("studio staff", () => {
    it("may record a decision on a sent stage", () => {
      for (const role of ["ADMIN", "MANAGER", "MEMBER"]) {
        expect(
          approvalDecisionError(
            { role },
            {
              status: "PENDING",
              project: project(),
            },
          ),
        ).toBeNull();
      }
    });

    it("may re-decide an already closed stage", () => {
      expect(
        approvalDecisionError(
          { role: "MANAGER" },
          {
            status: "CHANGES_REQUESTED",
            project: project(),
          },
        ),
      ).toBeNull();
    });

    it("must send the stage before recording a decision", () => {
      expect(
        approvalDecisionError(
          { role: "MANAGER" },
          {
            status: "DRAFT",
            project: project(),
          },
        ),
      ).toMatch(/send the stage/i);
    });

    it("is not blocked by the portal switch — that governs the client only", () => {
      expect(
        approvalDecisionError(
          { role: "MANAGER" },
          {
            status: "PENDING",
            project: project(false),
          },
        ),
      ).toBeNull();
    });
  });

  it("rejects an unknown role outright", () => {
    expect(
      approvalDecisionError(
        { role: "ROBOT" },
        {
          status: "PENDING",
          project: project(),
        },
      ),
    ).toMatch(/permission/i);
  });
});

describe("stageTrack", () => {
  const stage = (status: string, title = status.toLowerCase()) => ({
    id: `id-${title}`,
    title,
    description: `what happens during ${title}`,
    status,
  });

  const plan = { plan: true };
  const sent = { plan: false };

  it("says nothing about stages that were never sent, by default", () => {
    const track = stageTrack(
      [stage("APPROVED"), stage("PENDING"), stage("DRAFT")],
      sent,
    );

    expect(track.map((s) => s.title)).toEqual(["approved", "pending"]);
  });

  it("names the stages still being prepared once the plan is on", () => {
    const track = stageTrack(
      [stage("APPROVED"), stage("PENDING"), stage("DRAFT")],
      plan,
    );

    expect(track.map((s) => s.title)).toEqual(["approved", "pending", "draft"]);
  });

  it("gives away a draft's name and nothing else", () => {
    const [draft] = stageTrack([stage("DRAFT")], plan);

    expect(draft!.title).toBe("draft");
    expect(draft!.description).toBeNull();
  });

  it("keeps the description of a stage the client was actually sent", () => {
    const [pending] = stageTrack([stage("PENDING")], plan);

    expect(pending!.description).toBe("what happens during pending");
  });

  it("numbers the stages as they are shown, not as they are stored", () => {
    // The draft sits second in the database. With the plan off it is not
    // drawn, so the stage after it is the client's number two — a gap in the
    // numbering would be a gap in a path nobody can see the missing piece of.
    const track = stageTrack(
      [stage("APPROVED"), stage("DRAFT"), stage("PENDING")],
      sent,
    );

    expect(track.map((s) => [s.title, s.number])).toEqual([
      ["approved", 1],
      ["pending", 2],
    ]);
  });

  describe("states", () => {
    it("reads a decided stage straight off its status", () => {
      const track = stageTrack(
        [stage("APPROVED"), stage("CHANGES_REQUESTED"), stage("PENDING")],
        plan,
      );

      expect(track.map((s) => s.state)).toEqual([
        "accepted",
        "changes",
        "waiting",
      ]);
    });

    it("calls the first unsent stage the one in progress", () => {
      const track = stageTrack(
        [stage("APPROVED"), stage("DRAFT", "now"), stage("DRAFT", "later")],
        plan,
      );

      expect(track.map((s) => s.state)).toEqual([
        "accepted",
        "active",
        "upcoming",
      ]);
    });

    it("does not claim work is under way while the client is holding it", () => {
      // Something waiting on the client is not something being worked on, and
      // a draft behind it is queued rather than started.
      const track = stageTrack([stage("PENDING"), stage("DRAFT")], plan);

      expect(track.map((s) => s.state)).toEqual(["waiting", "upcoming"]);
      expect(track.map((s) => s.isCurrent)).toEqual([true, false]);
    });

    it("marks nothing as current once every stage is approved", () => {
      const track = stageTrack(
        [stage("APPROVED", "one"), stage("APPROVED", "two")],
        plan,
      );

      expect(track.some((s) => s.isCurrent)).toBe(false);
    });

    it("draws a project that ran out of order without tidying it up", () => {
      // Stage three signed off while two is still open. The path has to show
      // that, because it is what happened; a stepper that insisted on a
      // straight line would have to lie about one of the two.
      const track = stageTrack(
        [
          stage("APPROVED", "one"),
          stage("CHANGES_REQUESTED", "two"),
          stage("APPROVED", "three"),
        ],
        plan,
      );

      expect(track.map((s) => s.state)).toEqual([
        "accepted",
        "changes",
        "accepted",
      ]);
      expect(track.map((s) => s.isCurrent)).toEqual([false, true, false]);
    });
  });

  it("has a label for every state that claims one", () => {
    for (const state of ["accepted", "changes", "waiting", "active"] as const) {
      expect(stageStateLabels[state]).toBeTruthy();
    }
    expect(stageStateLabels.upcoming).toBeNull();
  });
});
