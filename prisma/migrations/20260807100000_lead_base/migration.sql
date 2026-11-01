-- The lead base, and the list of people who asked not to be written to.
--
-- Nothing in this migration sends anything. It adds the records outreach will
-- later work from, and — first, deliberately — the record of who is off
-- limits, so the suppression list exists before there is any machinery capable
-- of ignoring it.
--
-- This is also the point at which the schema starts holding people who have no
-- relationship with the studio at all. Every other person in this database
-- signed in, was invited, or wrote in. PRIVACY.md says so in those words.

CREATE TYPE "LeadStatus" AS ENUM (
    'NEW', 'ACTIVE', 'REPLIED', 'BOUNCED', 'UNSUBSCRIBED', 'DISQUALIFIED', 'CONVERTED'
);

CREATE TYPE "LeadSourceKind" AS ENUM ('CSV_IMPORT', 'MANUAL', 'INBOUND', 'REFERRAL');

CREATE TYPE "SuppressionReason" AS ENUM (
    'UNSUBSCRIBE', 'COMPLAINT', 'HARD_BOUNCE', 'REPEATED_SOFT_BOUNCE', 'MANUAL'
);

CREATE TABLE "LeadImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    -- Not nullable, and not defaulted. Whoever uploads a list has to answer
    -- where it came from, in the same form, before anything is written.
    "sourceDetail" TEXT NOT NULL,
    "consentNote" TEXT,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skippedDuplicate" INTEGER NOT NULL DEFAULT 0,
    "skippedSuppressed" INTEGER NOT NULL DEFAULT 0,
    "skippedInvalid" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadImport_createdAt_idx" ON "LeadImport"("createdAt");

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    -- The dedup key: trimmed and lowercased, nothing more. Anything cleverer
    -- would be the database deciding that two addresses are one person.
    "emailKey" TEXT NOT NULL,
    "name" TEXT,
    "companyName" TEXT,
    "title" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "sourceKind" "LeadSourceKind" NOT NULL,
    "sourceDetail" TEXT,
    "consentNote" TEXT,
    "importId" TEXT,
    "ownerId" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "lastRepliedAt" TIMESTAMP(3),
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "bounceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Lead_emailKey_key" ON "Lead"("emailKey");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
CREATE INDEX "Lead_lastContactedAt_idx" ON "Lead"("lastContactedAt");
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");

-- Deleting the import record does not delete the people in it; it only loses
-- the tie back to the upload.
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_importId_fkey"
    FOREIGN KEY ("importId") REFERENCES "LeadImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadImport" ADD CONSTRAINT "LeadImport_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The address is stored in the clear, and that is the point of the table.
--
-- LoginAttempt next door keeps only an HMAC of an address, because a counter
-- needs to recognise a visitor, not identify one. This one is the opposite: a
-- hash keyed on a rotatable secret would, the day somebody rotates it, quietly
-- re-permit mail to everyone who had asked not to receive any. A privacy
-- measure that can fail open into mailing people who said no is worse than
-- none.
--
-- There is deliberately no foreign key to "Lead": erasing a lead must not
-- re-open the door, so this row outlives the record it came from.
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Suppression_emailKey_key" ON "Suppression"("emailKey");
CREATE INDEX "Suppression_createdAt_idx" ON "Suppression"("createdAt");

-- A lead gets the same diary a client and a request already have.
ALTER TABLE "TimelineEntry" ADD COLUMN "leadId" TEXT;

CREATE INDEX "TimelineEntry_leadId_createdAt_idx" ON "TimelineEntry"("leadId", "createdAt");

ALTER TABLE "TimelineEntry" ADD CONSTRAINT "TimelineEntry_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Off, like every other integration on its first day.
ALTER TABLE "StudioSettings" ADD COLUMN "outreachEnabled" BOOLEAN NOT NULL DEFAULT false;
