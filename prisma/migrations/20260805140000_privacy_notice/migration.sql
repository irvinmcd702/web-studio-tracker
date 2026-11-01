-- Who answers for the data, for the client-facing privacy notice.
--
-- All nullable and empty by default: the notice says plainly that nobody has
-- filled them in rather than inventing a data controller.

ALTER TABLE "StudioSettings"
  ADD COLUMN "studioLegalName"     TEXT,
  ADD COLUMN "privacyContactEmail" TEXT,
  ADD COLUMN "privacyNoteExtra"    TEXT;
