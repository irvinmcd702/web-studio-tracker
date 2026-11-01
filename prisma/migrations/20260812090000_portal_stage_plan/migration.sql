-- The stage plan: whether the client sees the stages that have not been sent yet.
--
-- Approvals already reach the portal, but only once they are sent — drafts are
-- studio-internal, and the portal query says so in as many words. That rule
-- stands; this column does not weaken it. What it authorises is narrower: the
-- *names* of the stages still being prepared, so the client can see the shape
-- of the path rather than only the step they are standing on. Descriptions,
-- attached files and amounts stay behind the draft line, because those are
-- what a draft is actually drafting.
--
-- Default false, and false on every row that already exists. Drafts on live
-- projects were written under the old promise, and a migration is no place to
-- change what somebody has already been promised. A studio that wants the
-- plan shown turns it on per project, having looked at what is in there.
ALTER TABLE "StudioSettings" ADD COLUMN "portalShowStagePlan" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "portalShowStagePlan" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProjectTemplate" ADD COLUMN "portalShowStagePlan" BOOLEAN NOT NULL DEFAULT false;
