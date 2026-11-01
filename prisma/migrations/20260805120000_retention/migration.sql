-- How long things are kept.
--
-- All three default to 0, which means "keep forever": applying this migration
-- must not delete a single row of anybody's history. Choosing a period is a
-- decision the studio makes on the settings page.

ALTER TABLE "StudioSettings"
  ADD COLUMN "retainActivityDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "retainChatDays"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "retainAiUsageDays"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "retentionLastRunAt" TIMESTAMP(3),
  ADD COLUMN "retentionLastInfo"  TEXT;

-- Sign-in counters used to be keyed on the raw email address and IP. The keys
-- are now an HMAC of those values, so the old rows can neither be matched nor
-- read: they are counters, not records, and the correct migration is to drop
-- them. The worst case is that a lockout in progress is lifted early.
DELETE FROM "LoginAttempt";
