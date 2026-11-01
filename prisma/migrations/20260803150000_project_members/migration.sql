-- A project's crew is now picked person by person instead of by attaching
-- whole standing teams. Teams stay as a directory of who does what.

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the existing access over: everyone who reached a project through an
-- attached team becomes a named member of it. Their team title is kept as the
-- role, and the earliest attachment wins when someone arrived via two teams.
INSERT INTO "ProjectMember" ("id", "projectId", "userId", "role", "addedAt")
SELECT DISTINCT ON (pt."projectId", tm."userId")
       md5(pt."projectId" || ':' || tm."userId"),
       pt."projectId",
       tm."userId",
       COALESCE(tm."title", t."name"),
       pt."assignedAt"
FROM "ProjectTeam" pt
JOIN "TeamMember" tm ON tm."teamId" = pt."teamId"
JOIN "Team" t ON t."id" = pt."teamId"
ORDER BY pt."projectId", tm."userId", pt."assignedAt" ASC;

-- DropTable
DROP TABLE "ProjectTeam";
