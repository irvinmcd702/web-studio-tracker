import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { markChatReadAction } from "@/app/actions/chat";
import { Card, CardHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ProjectChat } from "@/components/project/chat";
import { AiSuggestion } from "@/components/ui/ai-suggestion";
import { summariseChatAction } from "@/app/actions/ai";
import { aiStatus } from "@/lib/ai";
import { markMentionsRead, mentionableOn } from "@/lib/mentions";

export default async function ProjectChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  if (!(await canAccessProject(user, id))) notFound();

  const project = await prisma.project.findUnique({
    where: { id },
    include: { client: { include: { users: true } } },
  });
  if (!project) notFound();

  const messages = await prisma.chatMessage.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    include: { author: true },
  });

  const unread = messages.filter(
    (m) => m.readAt === null && m.author.role === "CLIENT",
  ).length;

  // Everyone a handle resolves to here, for showing a mention as one — and the
  // same list without you, for the picker: naming yourself notifies nobody.
  const mentionable = await mentionableOn(id);
  const handles = mentionable.map((p) => p.handle);
  const people = mentionable.filter((p) => p.id !== user.id);

  await markMentionsRead({ userId: user.id, projectId: id });

  const clientContacts = project.client?.users ?? [];

  const status = await aiStatus();
  const canSummarise =
    status.usable && project.aiAllowed && messages.length >= 3;

  return (
    <div className="grid gap-6 xl:grid-cols-4">
      <Card className="xl:col-span-3">
        <CardHeader
          title="Client chat"
          description={
            project.client
              ? `${project.client.name}${clientContacts.length ? ` · ${clientContacts.map((u) => u.name).join(", ")}` : " · no portal access yet"}`
              : "This project has no client — the chat acts as an internal channel"
          }
          action={
            unread > 0 ? (
              <form action={markChatReadAction}>
                <input type="hidden" name="projectId" value={id} />
                <Button type="submit" variant="secondary" size="sm">
                  Mark {unread} as read
                </Button>
              </form>
            ) : null
          }
        />
        <ProjectChat
          projectId={id}
          handles={handles}
          people={people}
          currentUserId={user.id}
          canPostInternal
          messages={messages.map((m) => ({
            id: m.id,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
            isInternal: m.isInternal,
            author: {
              id: m.author.id,
              name: m.author.name,
              avatarColor: m.author.avatarColor,
              role: m.author.role,
            },
          }))}
        />
      </Card>

      <Card className="h-fit">
        <CardHeader title="How this works" />
        <div className="space-y-3 px-5 py-4 text-[13px] leading-relaxed text-[var(--color-muted)]">
          <p>
            The client sees this conversation in their portal and can reply
            straight from there.
          </p>
          <p>
            <span className="font-medium text-[var(--color-ink)]">
              Internal notes
            </span>{" "}
            stay visible to studio staff only — use them to discuss things
            without the client.
          </p>
          {clientContacts.length === 0 && project.client ? (
            <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-[var(--color-warn)]">
              This client has no login yet. Create one on the client page so
              they can reply.
            </p>
          ) : null}
        </div>

        {canSummarise ? (
          <div className="border-t border-[var(--color-line)] px-5 py-4">
            <AiSuggestion
              action={summariseChatAction}
              fields={{ projectId: id }}
              label="Catch me up"
              pendingText="Reading the thread…"
              hint="Internal notes included."
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
