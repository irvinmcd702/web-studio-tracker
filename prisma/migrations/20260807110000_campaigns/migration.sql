-- Campaigns, and the messages they send.
--
-- The rule this whole subsystem rests on is a schema decision as much as a
-- code one: "CampaignStep"."body" is a template a person wrote and saved, and
-- nothing regenerates it at send time. What a human read is what goes out. The
-- header comment on lib/outreach-send.ts says the same thing at more length,
-- and names what is deliberately not implemented.
--
-- Only one outbound message exists per enrolment at a time. Step n+1 is
-- written after step n has actually gone, so enrolling 500 leads in a
-- five-touch sequence writes 500 rows rather than 2500, and stopping a
-- sequence is one row moving to CANCELLED.

CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'FINISHED');

CREATE TYPE "EnrolmentStatus" AS ENUM (
    'AWAITING_APPROVAL', 'ACTIVE', 'COMPLETED', 'STOPPED_REPLIED',
    'STOPPED_BOUNCED', 'STOPPED_UNSUBSCRIBED', 'STOPPED_BY_HAND'
);

CREATE TYPE "MessageDirection" AS ENUM ('OUT', 'IN');

CREATE TYPE "MessageState" AS ENUM (
    'DRAFT', 'AWAITING_APPROVAL', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'
);

CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    -- The window belongs to the campaign, not the studio: one audience wants
    -- different hours from another. The studio-wide ceiling sits above it.
    "windowStartHour" INTEGER NOT NULL DEFAULT 9,
    "windowEndHour" INTEGER NOT NULL DEFAULT 17,
    "windowDays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "dailyCap" INTEGER NOT NULL DEFAULT 30,
    "minGapMinutes" INTEGER NOT NULL DEFAULT 6,
    "fromName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

CREATE TABLE "CampaignStep" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    -- Days after the previous step actually went out, not after enrolment: a
    -- sequence delayed by a send window should stay evenly spaced rather than
    -- firing three messages in an afternoon to catch up.
    "delayDays" INTEGER NOT NULL DEFAULT 3,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CampaignStep_campaignId_position_key" ON "CampaignStep"("campaignId", "position");

CREATE TABLE "CampaignEnrolment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "EnrolmentStatus" NOT NULL DEFAULT 'AWAITING_APPROVAL',
    -- Null means nothing has been sent and nothing can be. The scheduler
    -- refuses to claim an unapproved enrolment, so hiding the button in the
    -- interface is not what makes this safe.
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentStep" INTEGER NOT NULL DEFAULT 0,
    "stoppedReason" TEXT,
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignEnrolment_pkey" PRIMARY KEY ("id")
);

-- One enrolment per lead per campaign: the same person cannot be walked
-- through the same sequence twice by two people enrolling the same list.
CREATE UNIQUE INDEX "CampaignEnrolment_campaignId_leadId_key" ON "CampaignEnrolment"("campaignId", "leadId");
CREATE INDEX "CampaignEnrolment_status_idx" ON "CampaignEnrolment"("status");

CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL DEFAULT 'OUT',
    "leadId" TEXT,
    "campaignId" TEXT,
    "enrolmentId" TEXT,
    "stepId" TEXT,
    "fromEmail" TEXT,
    "toEmail" TEXT,
    "subject" TEXT NOT NULL,
    -- A copy of what was sent, not something re-rendered on demand. Editing
    -- the campaign's template afterwards must not rewrite the record.
    "body" TEXT NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "rfcMessageId" TEXT,
    "inReplyTo" TEXT,
    "referencesRaw" TEXT,
    "replyToken" TEXT,
    "providerId" TEXT,
    "state" "MessageState" NOT NULL DEFAULT 'DRAFT',
    "draftedBy" "ActorKind" NOT NULL DEFAULT 'HUMAN',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    -- The lease. claimedBy is one tick's run id, never a user.
    "claimedAt" TIMESTAMP(3),
    "claimedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutreachMessage_rfcMessageId_key" ON "OutreachMessage"("rfcMessageId");
CREATE UNIQUE INDEX "OutreachMessage_replyToken_key" ON "OutreachMessage"("replyToken");

-- The claim query, and the only index the scheduler actually needs.
CREATE INDEX "OutreachMessage_state_scheduledFor_idx" ON "OutreachMessage"("state", "scheduledFor");
CREATE INDEX "OutreachMessage_leadId_createdAt_idx" ON "OutreachMessage"("leadId", "createdAt");
CREATE INDEX "OutreachMessage_campaignId_createdAt_idx" ON "OutreachMessage"("campaignId", "createdAt");
CREATE INDEX "OutreachMessage_direction_createdAt_idx" ON "OutreachMessage"("direction", "createdAt");

ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignStep" ADD CONSTRAINT "CampaignStep_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignEnrolment" ADD CONSTRAINT "CampaignEnrolment_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignEnrolment" ADD CONSTRAINT "CampaignEnrolment_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignEnrolment" ADD CONSTRAINT "CampaignEnrolment_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deleting the lead takes their messages: the body holds what was written to
-- that person, and it should not outlive the record it was addressed to.
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Deleting a campaign or a step does NOT delete what was already sent. A
-- record of a message that went to a stranger has to survive somebody tidying
-- up the campaign it came from.
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_enrolmentId_fkey"
    FOREIGN KEY ("enrolmentId") REFERENCES "CampaignEnrolment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_stepId_fkey"
    FOREIGN KEY ("stepId") REFERENCES "CampaignStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The diary can hang off a campaign and off a single message too.
ALTER TABLE "TimelineEntry" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "TimelineEntry" ADD COLUMN "messageId" TEXT;

CREATE INDEX "TimelineEntry_campaignId_createdAt_idx" ON "TimelineEntry"("campaignId", "createdAt");

ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL rather than CASCADE: sweeping an old message body must not delete
-- the diary line saying it was sent.
ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "OutreachMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- What sending needs to know. Every one of them is empty on this migration,
-- and the scheduler refuses to send while the postal address is.
ALTER TABLE "StudioSettings" ADD COLUMN "outreachFromName" TEXT;
ALTER TABLE "StudioSettings" ADD COLUMN "outreachReplyDomain" TEXT;
ALTER TABLE "StudioSettings" ADD COLUMN "outreachPostalAddress" TEXT;
ALTER TABLE "StudioSettings" ADD COLUMN "outreachSignature" TEXT;
ALTER TABLE "StudioSettings" ADD COLUMN "outreachDailyCap" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "StudioSettings" ADD COLUMN "outreachLastTickAt" TIMESTAMP(3);
ALTER TABLE "StudioSettings" ADD COLUMN "outreachLastTickInfo" TEXT;

-- Zero keeps them forever, the same convention as every other period here.
ALTER TABLE "StudioSettings" ADD COLUMN "retainOutreachDays" INTEGER NOT NULL DEFAULT 0;
