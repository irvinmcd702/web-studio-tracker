-- The diary: what happened to a client, and what happened to a request.
--
-- Until now neither carried any history at all. A request's status changed and
-- the previous value was simply gone, with nobody's name on the change --
-- while a ticket next door has kept every move since the first migration.
--
-- This is deliberately not a widening of "Activity". That table is the machine
-- audit trail and it is swept by retainActivityDays; a diary somebody keeps on
-- purpose must not evaporate because an admin set an audit-log retention
-- period. Different lifecycle, different knob, so a different table.

CREATE TYPE "TimelineKind" AS ENUM (
    'NOTE', 'STATUS', 'EMAIL_OUT', 'EMAIL_IN', 'BOUNCE', 'COMPLAINT',
    'UNSUBSCRIBE', 'CALL', 'MEETING', 'IMPORT', 'SYSTEM'
);

-- Who put the entry there. MACHINE exists so an entry the tracker filed reads
-- as one; CONTACT is the other side of a conversation, who has no account.
CREATE TYPE "ActorKind" AS ENUM ('HUMAN', 'MACHINE', 'CONTACT');

-- No "updatedAt" column, on purpose: nothing in the application updates a row
-- in this table. A diary you can edit afterwards is not a diary, and the point
-- of keeping one is that it says what was true at the time. Corrections are
-- new entries.
CREATE TABLE "TimelineEntry" (
    "id" TEXT NOT NULL,
    "kind" "TimelineKind" NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT,
    "actorKind" "ActorKind" NOT NULL DEFAULT 'HUMAN',
    "userId" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT,
    "requestId" TEXT,

    CONSTRAINT "TimelineEntry_pkey" PRIMARY KEY ("id")
);

-- Both indexes are the same query with a different parent: newest first, for
-- one record. There is no listing of the whole table anywhere.
CREATE INDEX "TimelineEntry_clientId_createdAt_idx" ON "TimelineEntry"("clientId", "createdAt");
CREATE INDEX "TimelineEntry_requestId_createdAt_idx" ON "TimelineEntry"("requestId", "createdAt");

-- The record going takes its diary with it. A history of something that no
-- longer exists is a history nobody can check.
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "ClientRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Whoever wrote it leaving the studio does not remove what they recorded. The
-- entry keeps its text and loses its name, the same bargain every other
-- authored row in this schema makes.
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
