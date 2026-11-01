-- What "done" means, written on the ticket itself so whoever picks it up —
-- a person or an agent — doesn't have to infer it from the title.
ALTER TABLE "Ticket" ADD COLUMN "acceptance" TEXT;
