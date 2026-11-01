-- Mentions: "@dana, can you look at this".
--
-- Two parts: a stable short name to type after the `@`, and a row recording
-- that somebody was named, so the panel can know what has been read.

-- 1. The handle.
--
-- Backfilled from the email's local part, which is what everybody already
-- half-uses. Lowercased, anything that is not a letter, digit, dot, dash or
-- underscore removed, and a numeric suffix where two people collide — the
-- lowest id keeps the plain one, so the result does not depend on row order.

ALTER TABLE "User" ADD COLUMN "handle" TEXT;

WITH candidate AS (
  SELECT
    id,
    NULLIF(regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g'), '') AS base
  FROM "User"
),
numbered AS (
  SELECT
    id,
    COALESCE(base, 'person') AS base,
    row_number() OVER (PARTITION BY COALESCE(base, 'person') ORDER BY id) AS n
  FROM candidate
)
UPDATE "User" u
SET "handle" = CASE WHEN numbered.n = 1 THEN numbered.base
                    ELSE numbered.base || numbered.n::text END
FROM numbered
WHERE u.id = numbered.id;

ALTER TABLE "User" ALTER COLUMN "handle" SET NOT NULL;
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");

-- 2. The mention itself.

CREATE TABLE "Mention" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "authorId"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt"    TIMESTAMP(3),
  "excerpt"   TEXT NOT NULL,
  "projectId" TEXT,
  "ticketId"  TEXT,

  CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Mention_userId_readAt_idx" ON "Mention"("userId", "readAt");
CREATE INDEX "Mention_ticketId_idx" ON "Mention"("ticketId");

ALTER TABLE "Mention"
  ADD CONSTRAINT "Mention_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Mention_authorId_fkey" FOREIGN KEY ("authorId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Mention_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Mention_ticketId_fkey" FOREIGN KEY ("ticketId")
    REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
