import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, MessagesSquare } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { aiAllowedForProject, aiStatus } from "@/lib/ai";
import { formatDate, formatRelative } from "@/lib/utils";
import { type MeetingSummary } from "@/lib/meetings";
import { Card, CardHeader, EmptyState } from "@/components/ui/primitives";
import { MeetingForm } from "@/components/meeting/meeting-form";

export default async function ProjectMeetingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  if (!(await canAccessProject(user, id))) notFound();

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const meetings = await prisma.meeting.findMany({
    where: { projectId: id },
    orderBy: { heldAt: "desc" },
    include: {
      author: { select: { name: true } },
      _count: { select: { tickets: true } },
    },
  });

  const canEdit = canEditProject(user);
  // The same two switches as every other draft: the studio's, then this
  // project's. A transcript is the most personal material here, so the button
  // is absent rather than disabled when either says no.
  const status = await aiStatus();
  const canSummarise = status.usable && (await aiAllowedForProject(id));

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Meetings"
          description={
            meetings.length
              ? `${meetings.length} recorded on this project`
              : "Transcripts of calls, and what came out of them"
          }
        />

        {meetings.length === 0 ? (
          <EmptyState
            icon={<MessagesSquare size={20} />}
            title="No meetings yet"
            description="Zoom, Meet and Teams each write a transcript. Drop one in and it becomes a record of what was agreed."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {meetings.map((meeting) => {
              const summary = meeting.summary as MeetingSummary | null;
              return (
                <li key={meeting.id}>
                  <Link
                    href={`/projects/${id}/meetings/${meeting.id}`}
                    className="block px-5 py-4 hover:bg-[var(--color-surface-2)]"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-[14px] font-medium">
                        {meeting.title}
                      </span>
                      <span className="text-[12px] text-[var(--color-muted)]">
                        {formatDate(meeting.heldAt)}
                      </span>
                    </div>

                    <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">
                      {summary ? (
                        <>
                          {summary.decided.length} decision
                          {summary.decided.length === 1 ? "" : "s"} ·{" "}
                          {summary.actions.length} action
                          {summary.actions.length === 1 ? "" : "s"}
                          {meeting._count.tickets > 0 ? (
                            <>
                              {" · "}
                              <span className="inline-flex items-center gap-1 text-[var(--color-ok)]">
                                <CheckCircle2 size={12} />
                                {meeting._count.tickets} ticket
                                {meeting._count.tickets === 1 ? "" : "s"}
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        "Transcript filed — not read yet"
                      )}
                      {meeting.author
                        ? ` · added by ${meeting.author.name}`
                        : ""}
                      {" · "}
                      {formatRelative(meeting.createdAt)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="space-y-6">
        {canEdit ? (
          <Card>
            <CardHeader
              title="Add a meeting"
              description="Attach the transcript file, or paste it"
            />
            <div className="px-5 py-4">
              <MeetingForm projectId={id} />
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="How this works" />
          <div className="space-y-3 px-5 py-4 text-[13px] leading-relaxed text-[var(--color-muted)]">
            <p>
              The transcript is kept exactly as it arrived. Reading it is a
              separate step you ask for, on the meeting&rsquo;s own page.
            </p>
            <p>
              What the model finds — what was discussed, what was decided, what
              somebody agreed to do — is a{" "}
              <span className="font-medium text-[var(--color-ink)]">
                draft beside the transcript
              </span>
              , never in place of it. Actions become tickets only when you tick
              them.
            </p>
            {!canSummarise ? (
              <p className="rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-[12.5px] text-[var(--color-warn)]">
                {!status.configured
                  ? "This server has no model configured, so transcripts can only be filed and read by people."
                  : !status.enabled
                    ? "Drafting is switched off for the studio, so nothing here is sent anywhere."
                    : "This project does not allow its material to be sent to the model provider. Its settings page is where that changes."}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
