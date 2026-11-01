import type { Project } from "@prisma/client";

/**
 * Single source of truth for what a customer may see on a project.
 * Every portal page and every action that a client can trigger reads this,
 * so hiding a section in the UI also closes the corresponding server path.
 */
export type PortalSettings = {
  description: boolean;
  dueDate: boolean;
  tasks: boolean;
  chat: boolean;
  files: boolean;
  uploads: boolean;
  hours: boolean;
  money: boolean;
  team: boolean;
  approvals: boolean;
  docs: boolean;
  /** Whether the client is told how much of the time was agent work. */
  agentHours: boolean;
  /**
   * Whether the stages still in preparation are named in the portal, so the
   * client sees the whole path and not only the step they are on. Names only:
   * what a draft says is still the studio's business.
   */
  stagePlan: boolean;
};

export function portalSettings(project: Project): PortalSettings {
  return {
    description: project.portalShowDescription,
    dueDate: project.portalShowDueDate,
    tasks: project.portalShowTasks,
    chat: project.portalShowChat,
    files: project.portalShowFiles,
    // Uploading implies the files section exists at all.
    uploads: project.portalShowFiles && project.portalAllowUploads,
    hours: project.portalShowHours,
    money: project.portalShowMoney,
    team: project.portalShowTeam,
    approvals: project.portalShowApprovals,
    docs: project.portalShowDocs,
    agentHours: project.portalShowAgentHours,
    // A plan of stages is meaningless where the stages themselves are hidden,
    // so this follows the approvals switch the way uploads follow files.
    stagePlan: project.portalShowApprovals && project.portalShowStagePlan,
  };
}

export const PORTAL_TOGGLES = [
  {
    name: "portalShowDescription",
    label: "Project description",
    hint: "The scope text from the project card",
  },
  {
    name: "portalShowDueDate",
    label: "Dates and deadline",
    hint: "Start and due date in the header",
  },
  {
    name: "portalShowTasks",
    label: "Task list",
    hint: "Only tickets flagged “visible to client” are ever listed",
  },
  {
    name: "portalShowChat",
    label: "Chat with the manager",
    hint: "Turning this off also blocks the client from posting",
  },
  {
    name: "portalShowFiles",
    label: "Files",
    hint: "Only files flagged “visible to client” are ever listed",
  },
  {
    name: "portalAllowUploads",
    label: "Let the client upload files",
    hint: "Requires the files section to be on",
  },
  {
    name: "portalShowHours",
    label: "Hours",
    hint: "Logged hours, the hour budget and its progress bar",
  },
  {
    name: "portalShowMoney",
    label: "Money",
    hint: "Billed amount, rate and contract value",
  },
  {
    name: "portalShowTeam",
    label: "Team members",
    hint: "Who from the studio is working on the project",
  },
  {
    name: "portalShowApprovals",
    label: "Stage approvals",
    hint: "Let the client sign off on deliverables, or ask for changes",
  },
  {
    name: "portalShowStagePlan",
    label: "The whole plan of stages",
    hint: "Names the stages still being prepared, so the client sees the path ahead. What is written inside a draft stays hidden either way. Requires stage approvals",
  },
  {
    name: "portalShowDocs",
    label: "Documents",
    hint: "Only docs marked as shared are ever listed",
  },
  {
    name: "portalShowAgentHours",
    label: "Agent hours, separately",
    hint: "Tells the client how much of the logged time was done with a coding agent. Off by default: disclose it deliberately, not by accident",
  },
] as const;

export type PortalToggleName = (typeof PORTAL_TOGGLES)[number]["name"];

export type PortalToggleValues = Record<PortalToggleName, boolean>;

/** Used when no studio defaults row exists yet. */
export const FALLBACK_PORTAL_VALUES: PortalToggleValues = {
  portalShowDescription: true,
  portalShowDueDate: true,
  portalShowTasks: true,
  portalShowChat: true,
  portalShowFiles: true,
  portalAllowUploads: true,
  portalShowHours: true,
  portalShowMoney: true,
  portalShowTeam: false,
  portalShowApprovals: true,
  portalShowStagePlan: false,
  portalShowDocs: false,
  portalShowAgentHours: false,
};

/** Pulls every portal flag out of anything that carries them (project or defaults). */
export function pickPortalValues(
  source: Partial<PortalToggleValues>,
): PortalToggleValues {
  const result = { ...FALLBACK_PORTAL_VALUES };
  for (const toggle of PORTAL_TOGGLES) {
    const value = source[toggle.name];
    if (typeof value === "boolean") result[toggle.name] = value;
  }
  return result;
}

/** Reads every portal checkbox out of a submitted form. */
export function readPortalValues(formData: FormData): PortalToggleValues {
  const result = { ...FALLBACK_PORTAL_VALUES };
  for (const toggle of PORTAL_TOGGLES) {
    result[toggle.name] = formData.get(toggle.name) === "on";
  }
  return result;
}
