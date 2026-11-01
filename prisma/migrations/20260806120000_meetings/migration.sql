-- Meetings, and what came out of them.
--
-- The transcript is stored whole and unaltered. The summary is a reading of
-- it, kept beside it rather than in place of it, so the two can always be
-- compared — which matters when the reading is a model's.
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "heldAt" TIMESTAMP(3) NOT NULL,
    "transcript" TEXT NOT NULL,
    "source" TEXT,
    "summary" JSONB,
    "summarisedAt" TIMESTAMP(3),
    "summaryPartial" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- Listing a project's meetings newest first is the only way they are read.
CREATE INDEX "Meeting_projectId_heldAt_idx" ON "Meeting"("projectId", "heldAt");

-- The project going takes its meetings with it: a transcript outliving the
-- project it belongs to is a transcript nobody is accountable for.
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Whoever uploaded it leaving does not remove the record of the meeting.
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Where a ticket came from, when it came from a meeting.
ALTER TABLE "Ticket" ADD COLUMN "meetingId" TEXT;

CREATE INDEX "Ticket_meetingId_idx" ON "Ticket"("meetingId");

-- SET NULL rather than CASCADE: deleting a meeting must never delete work
-- that was agreed in it. The ticket loses its provenance, nothing else.
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- How long a transcript is kept. Zero keeps it forever, like every other
-- retention setting here, and zero is the default: an upgrade must not start
-- deleting a studio's meetings on the morning it lands.
ALTER TABLE "StudioSettings" ADD COLUMN "retainMeetingDays" INTEGER NOT NULL DEFAULT 0;
