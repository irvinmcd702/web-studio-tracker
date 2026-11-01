/**
 * Rules hanging off a workflow arrow.
 *
 * `conditions` decide whether a move is allowed; `hooks` run after it went
 * through. Both are stored as JSON on the transition, so this file is the only
 * place that knows their shape — parsing is defensive because the column can
 * hold anything a previous version wrote.
 */

export type TransitionConditions = {
  /** Only these roles may use the arrow. Empty means anyone on the project. */
  roles: string[];
  /** Only the person the ticket is assigned to. */
  assigneeOnly: boolean;
  requireAssignee: boolean;
  requireEstimate: boolean;
  requireDescription: boolean;
  /** The ticket must say what "done" means before it can move on. */
  requireAcceptance: boolean;
  requireComment: boolean;
  /**
   * The ticket must already have been in this status at some point. This is
   * the one condition that asks about the past rather than the present: it is
   * what makes an optional shortcut possible — an arrow that skips QA, open
   * only to a ticket that has been through QA before.
   *
   * A status id, or null for no such requirement.
   */
  requireVisitedStatusId: string | null;
};

export type TransitionHooks = {
  /** Assign the ticket to whoever performed the move. */
  assignToActor: boolean;
  clearAssignee: boolean;
  /** Set the priority to this value, or leave it alone when null. */
  setPriority: string | null;
  /** Flip the "visible to client" flag, or leave it alone when null. */
  setClientVisible: boolean | null;
  /** Post this text as a comment, attributed to whoever moved the ticket. */
  postComment: string | null;
  /** Announce the move in the project's Rocket.Chat channel. */
  notifyChat: boolean;
  /** POST the event to this URL. */
  webhookUrl: string | null;
};

export const EMPTY_CONDITIONS: TransitionConditions = {
  roles: [],
  assigneeOnly: false,
  requireAssignee: false,
  requireEstimate: false,
  requireDescription: false,
  requireAcceptance: false,
  requireComment: false,
  requireVisitedStatusId: null,
};

export const EMPTY_HOOKS: TransitionHooks = {
  assignToActor: false,
  clearAssignee: false,
  setPriority: null,
  setClientVisible: null,
  postComment: null,
  notifyChat: false,
  webhookUrl: null,
};

const ROLES = ["ADMIN", "MANAGER", "MEMBER"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asBool(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function parseConditions(value: unknown): TransitionConditions {
  const raw = asRecord(value);
  const roles = Array.isArray(raw.roles)
    ? raw.roles.filter(
        (r): r is string => typeof r === "string" && ROLES.includes(r),
      )
    : [];

  return {
    roles,
    assigneeOnly: asBool(raw.assigneeOnly),
    requireAssignee: asBool(raw.requireAssignee),
    requireEstimate: asBool(raw.requireEstimate),
    requireDescription: asBool(raw.requireDescription),
    requireAcceptance: asBool(raw.requireAcceptance),
    requireComment: asBool(raw.requireComment),
    requireVisitedStatusId:
      typeof raw.requireVisitedStatusId === "string" &&
      raw.requireVisitedStatusId
        ? raw.requireVisitedStatusId
        : null,
  };
}

export function parseHooks(value: unknown): TransitionHooks {
  const raw = asRecord(value);
  const priority = asText(raw.setPriority, 20);
  const url = asText(raw.webhookUrl, 500);

  return {
    assignToActor: asBool(raw.assignToActor),
    clearAssignee: asBool(raw.clearAssignee),
    setPriority: priority && PRIORITIES.includes(priority) ? priority : null,
    setClientVisible:
      typeof raw.setClientVisible === "boolean" ? raw.setClientVisible : null,
    postComment: asText(raw.postComment, 1000),
    notifyChat: asBool(raw.notifyChat),
    webhookUrl: url && isSafeWebhookUrl(url) ? url : null,
  };
}

export function isSafeWebhookUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** True when nothing is configured, so the UI can show a plain arrow. */
export function hasConditions(c: TransitionConditions) {
  return (
    c.roles.length > 0 ||
    c.assigneeOnly ||
    c.requireAssignee ||
    c.requireEstimate ||
    c.requireDescription ||
    c.requireAcceptance ||
    c.requireComment
  );
}

export function hasHooks(h: TransitionHooks) {
  return (
    h.assignToActor ||
    h.clearAssignee ||
    h.setPriority !== null ||
    h.setClientVisible !== null ||
    h.postComment !== null ||
    h.notifyChat ||
    h.webhookUrl !== null
  );
}

export type TransitionContext = {
  actor: { id: string; role: string };
  ticket: {
    assigneeId: string | null;
    estimate: number | null;
    description: string | null;
    acceptance: string | null;
    commentCount: number;
    /** Every status this ticket has ever been moved into. */
    visitedStatusIds: string[];
  };
};

/**
 * Returns the first unmet condition as a human message, or null when the move
 * may proceed. Order is deliberate: identity first, then ticket completeness,
 * so the person is told why they can't act before being told what's missing.
 */
export function checkConditions(
  conditions: TransitionConditions,
  ctx: TransitionContext,
): string | null {
  if (
    conditions.roles.length > 0 &&
    !conditions.roles.includes(ctx.actor.role)
  ) {
    return `This transition is limited to: ${conditions.roles.join(", ")}`;
  }

  if (conditions.assigneeOnly && ctx.ticket.assigneeId !== ctx.actor.id) {
    return "Only the ticket's assignee can make this move";
  }

  if (conditions.requireAssignee && !ctx.ticket.assigneeId) {
    return "Assign the ticket before moving it";
  }

  if (conditions.requireEstimate && (ctx.ticket.estimate ?? 0) <= 0) {
    return "Set an estimate before moving it";
  }

  if (conditions.requireDescription && !ctx.ticket.description?.trim()) {
    return "Fill in the description before moving it";
  }

  if (conditions.requireAcceptance && !ctx.ticket.acceptance?.trim()) {
    return "Write the acceptance criteria before moving it";
  }

  if (conditions.requireComment && ctx.ticket.commentCount < 1) {
    return "Leave a comment before moving it";
  }

  if (
    conditions.requireVisitedStatusId &&
    !ctx.ticket.visitedStatusIds.includes(conditions.requireVisitedStatusId)
  ) {
    // Named by the caller, which knows the status names; this file only knows
    // ids, and "needs status cm3x…" would help nobody.
    return "This shortcut is only open to a ticket that has already been through the step it skips";
  }

  return null;
}

/** Short labels for the canvas, so an arrow shows what it carries. */
/**
 * The rules on an arrow, in words.  resolves the id in the
 * history condition — without it the caller gets a vaguer sentence rather than
 * an id nobody can read.
 */
export function describeConditions(
  c: TransitionConditions,
  statusName?: (id: string) => string | undefined,
): string[] {
  const parts: string[] = [];
  if (c.roles.length) parts.push(c.roles.join("/").toLowerCase());
  if (c.assigneeOnly) parts.push("assignee only");
  if (c.requireAssignee) parts.push("needs assignee");
  if (c.requireEstimate) parts.push("needs estimate");
  if (c.requireDescription) parts.push("needs description");
  if (c.requireAcceptance) parts.push("needs acceptance criteria");
  if (c.requireComment) parts.push("needs comment");
  if (c.requireVisitedStatusId) {
    const name = statusName?.(c.requireVisitedStatusId);
    parts.push(
      name ? `only after ${name}` : "only after an earlier step it skips",
    );
  }
  return parts;
}

export function describeHooks(h: TransitionHooks): string[] {
  const parts: string[] = [];
  if (h.assignToActor) parts.push("assign to me");
  if (h.clearAssignee) parts.push("unassign");
  if (h.setPriority) parts.push(`priority → ${h.setPriority.toLowerCase()}`);
  if (h.setClientVisible !== null) {
    parts.push(h.setClientVisible ? "show to client" : "hide from client");
  }
  if (h.postComment) parts.push("auto comment");
  if (h.notifyChat) parts.push("notify chat");
  if (h.webhookUrl) parts.push("webhook");
  return parts;
}
