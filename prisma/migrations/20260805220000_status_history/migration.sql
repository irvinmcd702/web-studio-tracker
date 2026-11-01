-- A ticket's movement as data, so a workflow condition can ask about it.
--
-- The activity feed already narrates every move, but as a sentence that
-- changes when a status is renamed. "Only once this has been through QA" has
-- to ask a question, and a question cannot be asked of prose.
--
-- Deliberately no foreign keys to "WorkflowStatus": a history that vanishes
-- when somebody edits the workflow is not a history. The status name is copied
-- for the same reason.
--
-- The table starts empty. Nothing is backfilled from the activity feed,
-- because matching a message like "moved the ticket: QA → Done" back to status
-- ids is guesswork, and a guessed history would silently allow or block real
-- transitions. History starts the day this is deployed, and the condition
-- says so where it is set.

CREATE TABLE "TicketStatusChange" (
  "id"           TEXT NOT NULL,
  "ticketId"     TEXT NOT NULL,
  "fromStatusId" TEXT,
  "toStatusId"   TEXT NOT NULL,
  "toStatusName" TEXT NOT NULL,
  "userId"       TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TicketStatusChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TicketStatusChange_ticketId_createdAt_idx"
  ON "TicketStatusChange"("ticketId", "createdAt");

ALTER TABLE "TicketStatusChange"
  ADD CONSTRAINT "TicketStatusChange_ticketId_fkey" FOREIGN KEY ("ticketId")
    REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TicketStatusChange_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
