-- Showing agent hours separately is a choice, not a default. The source is
-- always recorded; these flags only decide who is shown the split.
ALTER TABLE "StudioSettings" ADD COLUMN "agentHoursVisible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StudioSettings" ADD COLUMN "portalShowAgentHours" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "portalShowAgentHours" BOOLEAN NOT NULL DEFAULT false;
