-- Bearer tokens for the JSON API, and a source on every logged hour so time
-- written by an agent is never counted as a person's own work.

-- CreateEnum
CREATE TYPE "WorkSource" AS ENUM ('HUMAN', 'AGENT');

-- CreateEnum
CREATE TYPE "ApiTokenKind" AS ENUM ('PERSONAL', 'AGENT');

-- CreateEnum
CREATE TYPE "ApiScope" AS ENUM ('READ', 'WRITE');

-- AlterTable
ALTER TABLE "WorkLog" ADD COLUMN     "source" "WorkSource" NOT NULL DEFAULT 'HUMAN';

-- CreateTable
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "kind" "ApiTokenKind" NOT NULL DEFAULT 'AGENT',
    "scopes" "ApiScope"[] DEFAULT ARRAY['READ']::"ApiScope"[],
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ApiToken_userId_idx" ON "ApiToken"("userId");

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
