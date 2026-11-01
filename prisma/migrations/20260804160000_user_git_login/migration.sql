-- Pull-request payloads carry a forge username and no email, so a person needs
-- their login on record before a PR can be attributed to them.
ALTER TABLE "User" ADD COLUMN "gitLogin" TEXT;
