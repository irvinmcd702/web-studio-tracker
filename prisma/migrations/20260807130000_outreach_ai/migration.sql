-- Drafting outreach with a model, behind a third gate of its own.
--
-- "aiDefaultAllowed" already answers "may material with no project attached go
-- to the provider". This is a separate question and it gets a separate answer:
-- a studio may happily send its own tickets to a model and still refuse to
-- send it a letter from a stranger who never asked to be contacted. Reusing
-- the existing switch would have made one answer stand for both.
ALTER TABLE "StudioSettings" ADD COLUMN "outreachAiAllowed" BOOLEAN NOT NULL DEFAULT false;

-- So that "was this person's material ever sent anywhere" has an answer for a
-- lead, and not only for a project. PRIVACY.md promises exactly that.
ALTER TABLE "AiUsage" ADD COLUMN "leadId" TEXT;

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Who filed a request.
--
-- The tracker may now create one by itself, from a reply it read. That is the
-- single autonomous write in the whole feature, and it is only defensible if
-- it is legible as one: HUMAN for the intake form and for staff, MACHINE when
-- the tracker filed it. The list and the detail page both show it.
ALTER TABLE "ClientRequest" ADD COLUMN "createdByKind" "ActorKind" NOT NULL DEFAULT 'HUMAN';

ALTER TABLE "ClientRequest" ADD COLUMN "leadId" TEXT;

-- SET NULL rather than CASCADE: erasing a lead must not delete a request the
-- studio has since started working from.
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
