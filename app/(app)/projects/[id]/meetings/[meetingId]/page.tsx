import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { canAccessProject, canEditProject } from "@/lib/permissions";
import { aiAllowedForProject, aiStatus } from "@/lib/ai";
import { deleteMeetingAction } from "@/app/actions/meetings";
import { formatDate, formatRelative, ticketKey } from "@/lib/utils";
import { speakersIn, type MeetingSummary } from "@/lib/meetings";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";
import { ConfirmIconSubmit } from "@/components/ui/confirm-submit";
import { MeetingSummaryPanel } from "@/components/meeting/summary-panel";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ id: string; meetingId: string }>;
}) {
  const user = await requireStaff();
  const { id, meetingId } = await params;
  if (!(await canAccessProject(user, id))) notFound();

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      author: { select: { name: true } },
      project: { select: { id: true, key: true } },
      tickets: {
        select: { id: true, number: true, title: true },
        orderBy: { number: "asc" },
      },
    },
  });
  // Checked against the project in the URL as well as its own: a meeting id
  // from another project must not open here.
  if (!meeting || meeting.projectId !== id) notFound();

  const summary = meeting.summary as MeetingSummary | null;
  const canEdit = canEditProject(user);
  const status = await aiStatus();
  const canSummarise =
    canEdit && status.usable && (await aiAllowedForProject(id));
  const speakers = speakersIn(meeting.transcript);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 text-[13px] text-[var(--color-muted)]">
            <Link href={`/projects/${id}/meetings`} className="hover:underline">
              Meetings
            </Link>
          </div>
          <h1 className="text-[20px] font-semibold tracking-tight">
            {meeting.title}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            {formatDate(meeting.heldAt)}
            {meeting.author ? ` · filed by ${meeting.author.name}` : ""}
            {meeting.source ? ` · ${meeting.source}` : ""}
            {speakers.length > 0 ? ` · ${speakers.join(", ")}` : ""}
          </p>
        </div>

        {canEdit ? (
          <form action={deleteMeetingAction}>
            <input type="hidden" name="id" value={meeting.id} />
            <ConfirmIconSubmit title="Delete this meeting">
              <Trash2 size={14} />
            </ConfirmIconSubmit>
          </form>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <MeetingSummaryPanel
            meetingId={meeting.id}
            summary={summary}
            partial={meeting.summaryPartial}
            summarisedAt={
              meeting.summarisedAt ? formatRelative(meeting.summarisedAt) : null
            }
            canSummarise={canSummarise}
            canEdit={canEdit}
            reason={
              !status.configured
                ? "This server has no model configured."
                : !status.enabled
                  ? "Drafting is switched off for the studio."
                  : "This project does not allow its material to be sent."
            }
          />

          <Card>
            <CardHeader
              title="Transcript"
              description="As it arrived. Nothing here is rewritten."
            />
            <div className="px-5 py-4">
              <pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-[var(--color-ink-2)] scroll-thin">
                {meeting.transcript}
              </pre>
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader
            title="Tickets from this meeting"
            description={
              meeting.tickets.length
                ? "Made from the actions somebody ticked"
                : "None yet"
            }
          />
          <div className="px-5 py-4">
            {meeting.tickets.length === 0 ? (
              <p className="text-[13px] text-[var(--color-muted)]">
                Nothing has been turned into work yet. Anything created here
                keeps a link back to this meeting, so the reason it exists
                survives.
              </p>
            ) : (
              <ul className="space-y-2">
                {meeting.tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <Link
                      href={`/tickets/${ticket.id}`}
                      className="flex items-baseline gap-2 text-[13px] hover:underline"
                    >
                      <Badge color="#64748b">
                        {ticketKey(meeting.project.key, ticket.number)}
                      </Badge>
                      <span className="min-w-0 flex-1">{ticket.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
