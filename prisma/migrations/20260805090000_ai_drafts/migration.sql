-- Drafting with a model, behind two switches: one for the studio, one per
-- project. Both default to off — nothing starts leaving the building because
-- an upgrade was applied.

ALTER TABLE "StudioSettings"
  ADD COLUMN "aiEnabled"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiModel"          TEXT    NOT NULL DEFAULT 'anthropic/claude-sonnet-5',
  ADD COLUMN "aiDefaultAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiLastUsedAt"     TIMESTAMP(3),
  ADD COLUMN "aiLastError"      TEXT;

ALTER TABLE "Project"
  ADD COLUMN "aiAllowed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AiUsage" (
  "id"               TEXT         NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "kind"             TEXT         NOT NULL,
  "model"            TEXT         NOT NULL,
  "promptTokens"     INTEGER      NOT NULL DEFAULT 0,
  "completionTokens" INTEGER      NOT NULL DEFAULT 0,
  "costUsd"          DOUBLE PRECISION,
  "ok"               BOOLEAN      NOT NULL DEFAULT true,
  "error"            TEXT,
  "projectId"        TEXT,
  "userId"           TEXT,

  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");
CREATE INDEX "AiUsage_projectId_idx" ON "AiUsage"("projectId");

ALTER TABLE "AiUsage"
  ADD CONSTRAINT "AiUsage_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
