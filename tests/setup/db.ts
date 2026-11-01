import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * A client of its own, so tests never accidentally share the singleton that the
 * app uses. `.env.test` has already been loaded by the vitest config.
 */
export const db = new PrismaClient();

if (!process.env.DATABASE_URL?.includes("studio_tracker_test")) {
  throw new Error("Tests must run against studio_tracker_test");
}

/** Wipes every table. Order matters only where cascades don't cover us. */
export async function resetDb() {
  await db.timelineEntry.deleteMany();
  await db.outreachMessage.deleteMany();
  await db.campaignEnrolment.deleteMany();
  await db.campaignStep.deleteMany();
  await db.campaign.deleteMany();
  await db.suppression.deleteMany();
  await db.lead.deleteMany();
  await db.leadImport.deleteMany();
  await db.activity.deleteMany();
  await db.ticketStatusChange.deleteMany();
  await db.aiUsage.deleteMany();
  // Items cascade from the template.
  await db.projectTemplate.deleteMany();
  await db.apiToken.deleteMany();
  await db.webhookDelivery.deleteMany();
  await db.doc.deleteMany();
  await db.authToken.deleteMany();
  await db.loginAttempt.deleteMany();
  await db.approval.deleteMany();
  await db.runningTimer.deleteMany();
  await db.workLog.deleteMany();
  await db.ticketComment.deleteMany();
  await db.attachment.deleteMany();
  await db.chatMessage.deleteMany();
  await db.approval.deleteMany();
  await db.ticket.deleteMany();
  await db.meeting.deleteMany();
  await db.projectMember.deleteMany();
  await db.projectAccess.deleteMany();
  await db.clientRequest.deleteMany();
  await db.project.deleteMany();
  await db.workflowTransition.deleteMany();
  await db.workflowStatus.deleteMany();
  await db.workflow.deleteMany();
  await db.teamMember.deleteMany();
  await db.team.deleteMany();
  await db.user.deleteMany();
  await db.client.deleteMany();
  await db.studioSettings.deleteMany();
}

let counter = 0;
const uniq = () => `${counter++}-${Math.random().toString(36).slice(2, 8)}`;

export async function makeUser(
  overrides: Partial<Prisma.UserUncheckedCreateInput> = {},
) {
  return db.user.create({
    data: {
      email: `user-${uniq()}@studio.com`,
      handle: `u${uniq().replace(/-/g, "")}`,
      name: "Test Person",
      passwordHash: "x",
      role: "MEMBER",
      ...overrides,
    },
  });
}

export async function makeWorkflow(
  statuses: { name: string; category?: "TODO" | "IN_PROGRESS" | "DONE" }[] = [
    { name: "To do", category: "TODO" },
    { name: "Doing", category: "IN_PROGRESS" },
    { name: "Done", category: "DONE" },
  ],
) {
  return db.workflow.create({
    data: {
      name: `Workflow ${uniq()}`,
      statuses: {
        create: statuses.map((s, i) => ({
          name: s.name,
          category: s.category ?? "TODO",
          position: i,
          isInitial: i === 0,
        })),
      },
    },
    include: { statuses: { orderBy: { position: "asc" } } },
  });
}

export async function makeProject(
  overrides: Partial<Prisma.ProjectUncheckedCreateInput> = {},
) {
  const workflowId = overrides.workflowId ?? (await makeWorkflow()).id;

  return db.project.create({
    data: {
      key: `P${uniq()}`.replace(/-/g, "").toUpperCase(),
      name: "Test project",
      ...overrides,
      workflowId,
    },
  });
}

export async function makeTicket(
  projectId: string,
  statusId: string,
  overrides: Partial<Prisma.TicketUncheckedCreateInput> = {},
) {
  const number = (await db.ticket.count({ where: { projectId } })) + 1;
  return db.ticket.create({
    data: {
      number,
      title: `Ticket ${number}`,
      ...overrides,
      projectId,
      statusId,
    },
  });
}

/** Shape `projectScope`/`canAccessProject` expect. */
export function asSessionUser(user: {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "MEMBER" | "CLIENT";
  avatarColor: string;
  position: string | null;
  clientId: string | null;
}) {
  return user;
}
