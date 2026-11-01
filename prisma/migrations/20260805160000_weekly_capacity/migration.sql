-- How many hours a person is available in a normal week.
--
-- Defaults to 40 for everyone, which is wrong for part-timers and right as a
-- starting point: the figure only decides when a week is shown as
-- over-committed, so a wrong default misleads nobody about work already done.

ALTER TABLE "User"
  ADD COLUMN "weeklyCapacity" INTEGER NOT NULL DEFAULT 40;
