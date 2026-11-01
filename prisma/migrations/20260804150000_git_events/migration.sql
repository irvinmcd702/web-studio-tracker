-- Incoming git events: a branch or a pull request that names a ticket moves it
-- and leaves the link on the ticket.
ALTER TABLE "StudioSettings" ADD COLUMN "gitEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StudioSettings" ADD COLUMN "gitSecret" TEXT;
ALTER TABLE "StudioSettings" ADD COLUMN "gitStatusOnOpen" TEXT;
ALTER TABLE "StudioSettings" ADD COLUMN "gitStatusOnMerge" TEXT;
ALTER TABLE "StudioSettings" ADD COLUMN "gitLastEventAt" TIMESTAMP(3);
ALTER TABLE "StudioSettings" ADD COLUMN "gitLastEventInfo" TEXT;
