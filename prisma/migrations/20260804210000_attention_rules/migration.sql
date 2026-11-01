-- Deadline and attention rules, plus the daily digest.
--
-- Thresholds carry sensible defaults so an existing install starts producing
-- signals immediately; the digest itself stays off until someone turns it on.

ALTER TABLE "StudioSettings"
  ADD COLUMN "remindDueWithinDays"    INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "remindStalledDays"      INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "remindApprovalDays"     INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "remindClientReplyHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "remindTimerHours"       INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "remindBudgetPace"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "digestChatEnabled"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "digestEmailEnabled"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "digestLastRunAt"        TIMESTAMP(3),
  ADD COLUMN "digestLastInfo"         TEXT;
