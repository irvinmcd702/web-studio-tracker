import { prisma } from "./db";

export async function logActivity(input: {
  type: string;
  message: string;
  userId?: string | null;
  projectId?: string | null;
  ticketId?: string | null;
}) {
  await prisma.activity.create({
    data: {
      type: input.type,
      message: input.message,
      userId: input.userId ?? null,
      projectId: input.projectId ?? null,
      ticketId: input.ticketId ?? null,
    },
  });
}
