export const projectStatusLabels: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export const projectStatusColors: Record<string, string> = {
  DRAFT: "#94a3b8",
  ACTIVE: "#16a34a",
  ON_HOLD: "#d97706",
  COMPLETED: "#2563eb",
  ARCHIVED: "#64748b",
};

export const requestStatusLabels: Record<string, string> = {
  NEW: "New",
  IN_REVIEW: "In review",
  ACCEPTED: "Accepted",
  CONVERTED: "Converted",
  REJECTED: "Rejected",
};

export const requestStatusColors: Record<string, string> = {
  NEW: "#e11d48",
  IN_REVIEW: "#d97706",
  ACCEPTED: "#2563eb",
  CONVERTED: "#16a34a",
  REJECTED: "#64748b",
};

export const ticketTypeLabels: Record<string, string> = {
  TASK: "Task",
  BUG: "Bug",
  FEATURE: "Feature",
  CHORE: "Chore",
};

export const ticketTypeColors: Record<string, string> = {
  TASK: "#2563eb",
  BUG: "#dc2626",
  FEATURE: "#7c3aed",
  CHORE: "#64748b",
};

export const priorityLabels: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const priorityColors: Record<string, string> = {
  LOW: "#64748b",
  MEDIUM: "#0284c7",
  HIGH: "#ea580c",
  URGENT: "#dc2626",
};

export const categoryLabels: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export const roleLabels: Record<string, string> = {
  ADMIN: "Administrator",
  MANAGER: "Project manager",
  MEMBER: "Team member",
  CLIENT: "Client",
};

export const budgetTypeLabels: Record<string, string> = {
  HOURLY: "Hourly",
  FIXED: "Fixed price",
};

export const timelineKindLabels: Record<string, string> = {
  NOTE: "Note",
  STATUS: "Status",
  EMAIL_OUT: "Sent",
  EMAIL_IN: "Reply",
  BOUNCE: "Bounced",
  COMPLAINT: "Complaint",
  UNSUBSCRIBE: "Unsubscribed",
  CALL: "Call",
  MEETING: "Meeting",
  IMPORT: "Imported",
  SYSTEM: "Tracker",
};

/**
 * Colour is doing one job here: separating the kinds that are somebody's
 * problem (a bounce, a complaint, an unsubscribe) from the kinds that are just
 * the record ticking over. Everything else stays grey.
 */
export const timelineKindColors: Record<string, string> = {
  NOTE: "#2563eb",
  STATUS: "#64748b",
  EMAIL_OUT: "#64748b",
  EMAIL_IN: "#16a34a",
  BOUNCE: "#d97706",
  COMPLAINT: "#dc2626",
  UNSUBSCRIBE: "#dc2626",
  CALL: "#64748b",
  MEETING: "#64748b",
  IMPORT: "#64748b",
  SYSTEM: "#64748b",
};

/** How an entry names whoever is not a studio account. */
export const actorKindLabels: Record<string, string> = {
  HUMAN: "",
  MACHINE: "The tracker",
  CONTACT: "They",
};

export const leadStatusLabels: Record<string, string> = {
  NEW: "New",
  ACTIVE: "Being written to",
  REPLIED: "Replied",
  BOUNCED: "Bounced",
  UNSUBSCRIBED: "Unsubscribed",
  DISQUALIFIED: "Not a fit",
  CONVERTED: "Became a request",
};

export const leadStatusColors: Record<string, string> = {
  NEW: "#64748b",
  ACTIVE: "#2563eb",
  REPLIED: "#16a34a",
  BOUNCED: "#d97706",
  UNSUBSCRIBED: "#dc2626",
  DISQUALIFIED: "#64748b",
  CONVERTED: "#16a34a",
};

export const leadSourceLabels: Record<string, string> = {
  CSV_IMPORT: "Imported list",
  MANUAL: "Added by hand",
  INBOUND: "Wrote to us",
  REFERRAL: "Referral",
};

export const suppressionReasonLabels: Record<string, string> = {
  UNSUBSCRIBE: "Unsubscribed",
  COMPLAINT: "Marked it as spam",
  HARD_BOUNCE: "Address does not exist",
  REPEATED_SOFT_BOUNCE: "Kept bouncing",
  MANUAL: "Added by hand",
};

export const campaignStatusLabels: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Sending",
  PAUSED: "Paused",
  FINISHED: "Finished",
};

export const campaignStatusColors: Record<string, string> = {
  DRAFT: "#64748b",
  ACTIVE: "#16a34a",
  PAUSED: "#d97706",
  FINISHED: "#2563eb",
};

export const enrolmentStatusLabels: Record<string, string> = {
  AWAITING_APPROVAL: "Waiting for approval",
  ACTIVE: "In the sequence",
  COMPLETED: "Sequence finished",
  STOPPED_REPLIED: "Stopped — they replied",
  STOPPED_BOUNCED: "Stopped — it bounced",
  STOPPED_UNSUBSCRIBED: "Stopped — unsubscribed",
  STOPPED_BY_HAND: "Stopped by hand",
};

export const enrolmentStatusColors: Record<string, string> = {
  AWAITING_APPROVAL: "#d97706",
  ACTIVE: "#2563eb",
  COMPLETED: "#64748b",
  STOPPED_REPLIED: "#16a34a",
  STOPPED_BOUNCED: "#d97706",
  STOPPED_UNSUBSCRIBED: "#dc2626",
  STOPPED_BY_HAND: "#64748b",
};

export const messageStateLabels: Record<string, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Waiting for approval",
  SCHEDULED: "Scheduled",
  SENDING: "Sending",
  SENT: "Sent",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export const messageStateColors: Record<string, string> = {
  DRAFT: "#64748b",
  AWAITING_APPROVAL: "#d97706",
  SCHEDULED: "#2563eb",
  SENDING: "#2563eb",
  SENT: "#16a34a",
  FAILED: "#dc2626",
  CANCELLED: "#64748b",
};
