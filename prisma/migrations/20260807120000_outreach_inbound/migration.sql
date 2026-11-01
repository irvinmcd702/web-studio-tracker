-- Inbound: what comes back when somebody replies, bounces, or complains.
--
-- No new tables. Replies are `OutreachMessage` rows with direction IN, which
-- is why that column and the threading fields already exist — a reply is the
-- same kind of thing as what it answers, and storing it anywhere else would
-- mean two places to look for "what was said to this person".
--
-- The replay guard reuses "WebhookDelivery", the same table the git webhook
-- uses, with ids namespaced `outreach:` so the two cannot collide.

-- Stored as-is, not hashed: we have to recompute the same HMAC the provider
-- did. Same reasoning as "gitSecret" next door.
ALTER TABLE "StudioSettings" ADD COLUMN "outreachInboundSecret" TEXT;

ALTER TABLE "StudioSettings" ADD COLUMN "outreachLastInboundAt" TIMESTAMP(3);
ALTER TABLE "StudioSettings" ADD COLUMN "outreachLastInboundInfo" TEXT;

-- Two more attention rules, in the same shape as the rest: a threshold in the
-- unit its name gives, and zero switches the rule off.
--
-- A reply left unanswered is the one outreach failure that costs something —
-- a person wrote back to a machine and nobody came. It is worth a line in the
-- digest in a way that "a message went out" never is.
ALTER TABLE "StudioSettings" ADD COLUMN "remindOutreachReplyHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "StudioSettings" ADD COLUMN "remindOutreachApprovalDays" INTEGER NOT NULL DEFAULT 3;
