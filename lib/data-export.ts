import { prisma } from "./db";

/**
 * Everything the tracker holds about one person, in one file.
 *
 * Written to answer two requests with the same code: "show me what you have on
 * me" and "give me it in a form I can take elsewhere". JSON rather than a PDF
 * for exactly that reason — a file a person can only look at is an answer to
 * the first question and not the second.
 *
 * Secrets are excluded by selecting fields rather than by deleting them
 * afterwards: password and token hashes are never read out of the database at
 * all, so no future edit can accidentally leave one in.
 */

export type PersonExport = {
  exportedAt: string;
  about: {
    note: string;
    limits: string[];
  };
  account: unknown;
  client: unknown;
  membership: unknown;
  work: unknown;
  writing: unknown;
  files: unknown;
  security: unknown;
  history: unknown;
};

export async function exportPerson(
  userId: string,
): Promise<PersonExport | null> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      position: true,
      gitLogin: true,
      role: true,
      isActive: true,
      avatarColor: true,
      createdAt: true,
      updatedAt: true,
      passwordChangedAt: true,
      clientId: true,
      // passwordHash is deliberately absent.
    },
  });
  if (!account) return null;

  const [
    client,
    crews,
    teams,
    managedProjects,
    assignedTickets,
    reportedTickets,
    comments,
    chatMessages,
    workLogs,
    timer,
    docsAuthored,
    docsEdited,
    approvalsRequested,
    approvalsDecided,
    uploads,
    apiTokens,
    authTokens,
    aiUsage,
    activity,
  ] = await Promise.all([
    // A portal user's company carries contact details that describe a person.
    account.clientId
      ? prisma.client.findUnique({
          where: { id: account.clientId },
          select: {
            name: true,
            contactName: true,
            email: true,
            phone: true,
            website: true,
          },
        })
      : null,
    prisma.projectMember.findMany({
      where: { userId },
      select: {
        role: true,
        addedAt: true,
        project: { select: { key: true, name: true } },
      },
    }),
    prisma.teamMember.findMany({
      where: { userId },
      select: { title: true, joinedAt: true, team: { select: { name: true } } },
    }),
    prisma.project.findMany({
      where: { managerId: userId },
      select: { key: true, name: true, status: true },
    }),
    prisma.ticket.findMany({
      where: { assigneeId: userId },
      select: {
        number: true,
        title: true,
        createdAt: true,
        project: { select: { key: true } },
      },
    }),
    prisma.ticket.findMany({
      where: { reporterId: userId },
      select: {
        number: true,
        title: true,
        createdAt: true,
        project: { select: { key: true } },
      },
    }),
    prisma.ticketComment.findMany({
      where: { authorId: userId },
      select: {
        body: true,
        createdAt: true,
        ticket: {
          select: { number: true, project: { select: { key: true } } },
        },
      },
    }),
    prisma.chatMessage.findMany({
      where: { authorId: userId },
      select: {
        body: true,
        isInternal: true,
        createdAt: true,
        project: { select: { key: true } },
      },
    }),
    prisma.workLog.findMany({
      where: { userId },
      select: {
        hours: true,
        spentOn: true,
        description: true,
        source: true,
        ticket: {
          select: { number: true, project: { select: { key: true } } },
        },
      },
    }),
    prisma.runningTimer.findUnique({
      where: { userId },
      select: { startedAt: true, note: true },
    }),
    prisma.doc.findMany({
      where: { createdById: userId },
      select: { title: true, createdAt: true },
    }),
    prisma.doc.findMany({
      where: { updatedById: userId },
      select: { title: true, updatedAt: true },
    }),
    prisma.approval.findMany({
      where: { requestedById: userId },
      select: { title: true, requestedAt: true, status: true },
    }),
    prisma.approval.findMany({
      where: { decidedById: userId },
      select: {
        title: true,
        decidedAt: true,
        status: true,
        decisionNote: true,
      },
    }),
    prisma.attachment.findMany({
      where: { uploadedById: userId },
      select: {
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    }),
    prisma.apiToken.findMany({
      where: { userId },
      // The hash is never selected; the prefix is what a person sees anyway.
      select: {
        name: true,
        prefix: true,
        kind: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    }),
    prisma.authToken.findMany({
      where: { userId },
      select: { kind: true, createdAt: true, expiresAt: true, usedAt: true },
    }),
    prisma.aiUsage.findMany({
      where: { userId },
      select: {
        kind: true,
        model: true,
        createdAt: true,
        promptTokens: true,
        completionTokens: true,
        ok: true,
        project: { select: { key: true } },
      },
    }),
    prisma.activity.findMany({
      where: { userId },
      select: {
        type: true,
        message: true,
        createdAt: true,
        project: { select: { key: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    about: {
      note: "Everything Studio Tracker holds about this person, taken from the database at the moment above.",
      limits: [
        "Passwords and token secrets are not included: only hashes are stored, and they are not read by this export.",
        "Text other people wrote is not included, even where it mentions this person — it belongs to whoever wrote it and lives in their project's record.",
        "Files are listed by name, type and size; the file contents are downloaded from the project they belong to.",
        "Backups taken before this date still contain the earlier state.",
      ],
    },
    account,
    client,
    membership: { projects: crews, teams, managedProjects },
    work: {
      assignedTickets,
      reportedTickets,
      workLogs,
      runningTimer: timer,
      approvalsRequested,
      approvalsDecided,
    },
    writing: { comments, chatMessages, docsAuthored, docsEdited },
    files: uploads,
    security: { apiTokens, authTokens },
    history: { activity, aiUsage },
  };
}

/** `studio-tracker-dana-cole-2026-08-05.json` */
export function exportFileName(name: string, when = new Date()) {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "person";
  return `studio-tracker-${slug}-${when.toISOString().slice(0, 10)}.json`;
}
