-- Closed projects: a manager no longer sees one merely for being a manager.
--
-- Existing projects stay open. This has to default to false: turning it on for
-- everything would hide the studio's work from the studio on the morning of
-- the deploy.
ALTER TABLE "Project" ADD COLUMN "isConfidential" BOOLEAN NOT NULL DEFAULT false;

-- Who has been let in without being put on the crew.
CREATE TABLE "ProjectAccess" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectAccess_projectId_userId_key" ON "ProjectAccess"("projectId", "userId");
CREATE INDEX "ProjectAccess_userId_idx" ON "ProjectAccess"("userId");

-- The project going means the permission goes; the person going means the same.
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Losing the person who granted it must not revoke it: the permission stands
-- on its own, only the record of who gave it is forgotten.
ALTER TABLE "ProjectAccess" ADD CONSTRAINT "ProjectAccess_grantedById_fkey"
    FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Closed projects are the ones worth finding quickly when auditing who sees what.
CREATE INDEX "Project_isConfidential_idx" ON "Project"("isConfidential");
