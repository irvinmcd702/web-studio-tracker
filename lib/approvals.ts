export const approvalStatusLabels: Record<string, string> = {
  DRAFT: "Draft",
  PENDING: "Awaiting client",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
};

export const approvalStatusColors: Record<string, string> = {
  DRAFT: "#64748b",
  PENDING: "#d97706",
  APPROVED: "#16a34a",
  CHANGES_REQUESTED: "#dc2626",
};

/** What the client is shown — drafts are studio-internal. */
export const CLIENT_VISIBLE_STATUSES = [
  "PENDING",
  "APPROVED",
  "CHANGES_REQUESTED",
] as const;

export type StageState =
  "accepted" | "changes" | "waiting" | "active" | "upcoming";

export type Stage = {
  id: string;
  /** Its place in the plan as the client is shown it, counting from one. */
  number: number;
  title: string;
  description: string | null;
  state: StageState;
  /** The one stage the project is standing on. None, once all are approved. */
  isCurrent: boolean;
};

/** The pill under a stage. Stages nobody has reached yet claim nothing. */
export const stageStateLabels: Record<StageState, string | null> = {
  accepted: "Accepted",
  changes: "Changes requested",
  waiting: "Waiting for you",
  active: "In progress",
  upcoming: null,
};

/**
 * The stages of a project as a path, for the client portal.
 *
 * Four of the five states are simply the stage's own status said in the
 * client's language. Only `active` is inferred, and only for a draft: a stage
 * not yet sent, with nothing unfinished before it, is the one being worked on.
 * A draft further down the list is not — it is upcoming, and says nothing.
 *
 * Deriving no more than that is deliberate. Real projects do not run in a
 * straight line: stage four gets approved while three is still open, a stage
 * comes back with changes, another is added halfway through. Every state here
 * except `active` is read off a single row, so those projects draw correctly
 * instead of drawing a tidy lie. The only thing that could disagree with the
 * data is which stage is called current, and there the rule is stated above.
 *
 * `plan` decides whether stages still in preparation are named at all. When
 * they are, they are named and nothing more: the description is dropped here,
 * for every draft, so no caller has to remember to. That is the whole extent
 * of what `portalShowStagePlan` opens up.
 */
export function stageTrack(
  approvals: {
    id: string;
    title: string;
    description: string | null;
    status: string;
  }[],
  { plan }: { plan: boolean },
): Stage[] {
  const shown = approvals.filter((a) => a.status !== "DRAFT" || plan);

  const currentIndex = shown.findIndex((a) => a.status !== "APPROVED");

  return shown.map((approval, index) => {
    const isCurrent = index === currentIndex;

    const state: StageState =
      approval.status === "APPROVED"
        ? "accepted"
        : approval.status === "CHANGES_REQUESTED"
          ? "changes"
          : approval.status === "PENDING"
            ? "waiting"
            : isCurrent
              ? "active"
              : "upcoming";

    return {
      id: approval.id,
      number: index + 1,
      title: approval.title,
      // A draft is a draft: its name is all this switch ever authorised.
      description: approval.status === "DRAFT" ? null : approval.description,
      state,
      isCurrent,
    };
  });
}

/**
 * Who may record a decision on a stage, and when. Pulled out of the server
 * action so the rules can be tested directly — this is the check that stops a
 * client from signing off on something the portal never offered them.
 *
 * Returns the reason it is not allowed, or null when it is.
 */
export function approvalDecisionError(
  user: { role: string },
  approval: {
    status: string;
    project: { portalShowApprovals: boolean };
  },
): string | null {
  if (user.role === "CLIENT") {
    if (!approval.project.portalShowApprovals) {
      return "Approvals are disabled for this project";
    }
    if (approval.status !== "PENDING") {
      return "This stage is not awaiting your decision";
    }
    return null;
  }

  if (
    user.role !== "ADMIN" &&
    user.role !== "MANAGER" &&
    user.role !== "MEMBER"
  ) {
    return "You don't have permission to do that";
  }

  if (approval.status === "DRAFT") {
    return "Send the stage to the client before recording a decision";
  }

  return null;
}
