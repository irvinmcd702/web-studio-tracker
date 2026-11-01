# What this tracker does with personal data

An engineering record, assembled from the schema and the code rather than from
intentions. It is the raw material for a record of processing (GDPR Art. 30) and
for answering a customer's questionnaire; it is **not** legal advice, and the
parts only the studio can decide — the lawful basis, the retention periods you
actually choose, the contracts with the companies listed under _Who else gets it_
— are marked as yours.

The customer-facing version of this lives at `/portal/privacy` and is generated
from the live configuration, so it cannot claim an integration that is switched
off. Keep this file in step with the code; if you change what is stored, change
the table below in the same commit.

## Whose data is in here

- **Studio staff** — administrators, project managers, developers, designers.
- **Client contacts with a portal login** — one row in `User` each, role `CLIENT`.
- **Client contacts without a login** — the name, email and phone recorded on the
  `Client` row, and whoever filled in the intake form on `ClientRequest`.
- **People the studio has not spoken to yet** — `Lead` rows, imported or typed
  in. Until outreach existed, every person in this database had signed in, been
  invited, or written in first. That is no longer true, and it is the sharpest
  thing in this file: these people did not give the studio their data and in
  most cases have never heard of it. Present only when outreach is switched on,
  which it is not by default.

## What is stored, and why

| Where                                 | Personal data                                                                                                    | Why it exists                                               | How long                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `User`                                | name, email, position, forge login, avatar colour, password **hash**, last password change                       | Signing in, attributing work, deciding who may see what     | Life of the account; erasure strips it in place                                                       |
| `Client`                              | contact name, email, phone, website, notes                                                                       | Knowing who to talk to at the customer                      | Life of the customer relationship; editable and clearable by hand                                     |
| `ClientRequest`                       | contact name, email, phone, company, free-text description                                                       | An enquiry before it becomes a project                      | Life of the request                                                                                   |
| `TicketComment`, `ChatMessage`, `Doc` | whatever people wrote, which may name anyone                                                                     | The project's own record                                    | Chat: your chosen period, default indefinite. Comments and docs: life of the project                  |
| `Meeting`                             | a transcript **word for word**, with speakers named as the meeting tool named them; plus what a model made of it | The record of what was discussed and agreed                 | Your chosen period, default indefinite — dated by when the meeting was held, not when it was uploaded |
| `WorkLog`                             | who logged how many hours, when, against what                                                                    | The basis of an invoice                                     | Life of the project — never swept                                                                     |
| `Attachment`                          | uploader, original filename; the file on disk                                                                    | Files belonging to a project                                | Until deleted by hand (which also removes the file)                                                   |
| `Approval`                            | who decided, when, and their note                                                                                | Proof a stage was signed off                                | Life of the project                                                                                   |
| `Activity`                            | who did what, when                                                                                               | Audit trail, including the record of past erasures          | Your chosen period, default indefinite                                                                |
| `AuthToken`                           | **hash** of a one-time link, its owner, expiry                                                                   | Setting a password without anyone typing it for you         | 30 days past expiry, fixed                                                                            |
| `ApiToken`                            | **hash** of a token, its owner, last used                                                                        | Machine access acting as its issuer                         | Life of the token                                                                                     |
| `LoginAttempt`                        | **HMAC** of an email and an IP, a counter                                                                        | Slowing down password guessing                              | 24 hours past the window, fixed                                                                       |
| `AiUsage`                             | who asked for a draft, for which project, tokens and cost                                                        | Seeing what the model costs and proving what was sent where | Your chosen period, default indefinite                                                                |
| `RunningTimer`                        | whose stopwatch, since when                                                                                      | The timer feature                                           | Until stopped                                                                                         |
| `WebhookDelivery`                     | a delivery id                                                                                                    | Refusing a replayed webhook                                 | 7 days, fixed                                                                                         |
| `StudioSettings`                      | secrets and switches; no personal data                                                                           | Configuration                                               | Life of the install                                                                                   |
| `Lead`                                | name, email, company, job title, website, phone, country, **and the studio's own note of where the address came from**                | Somebody the studio may write to who has not asked to hear from it | Until deleted by hand |
| `LeadImport`                          | the file name, who uploaded it, what they said its source was, and the counts                                    | The record of which list a person arrived in                | Until deleted by hand                                                                                 |
| `Suppression`                         | **an email address, in the clear** — see below                                                                    | Addresses that must never be written to                     | **Forever. Never swept by anything, and kept even when the lead is deleted**                          |
| `TimelineEntry`                       | notes people wrote about a client, a request or a lead; status changes and who made them                          | The diary kept against a record                             | Append-only; goes when its parent record goes                                                         |
| `Campaign`, `CampaignStep`             | the studio's own text and sending rules; no personal data                                                         | A sequence of messages, written once by a person            | Until deleted by hand                                                                                 |
| `CampaignEnrolment`                    | which lead is in which sequence, how far through, who approved the first message                                  | Walking one person through a sequence                       | Until deleted by hand; goes with the lead                                                             |
| `OutreachMessage`                      | **the full text of what was sent to a named person, and of what they wrote back**, the addresses, and the threading headers | The record of what a stranger was told and what they said   | Your chosen period, default indefinite. The diary line saying a message was sent survives the sweep   |
| `Ticket`                              | title, description and acceptance criteria — free text that may name anyone; who it is assigned to and who raised it | The unit of work                                            | Life of the project — never swept                                                                     |
| `TicketStatusChange`                  | who moved a ticket, from what to what, when                                                                       | The history of a piece of work                              | Life of the ticket                                                                                    |
| `Mention`                             | who was named, by whom, and **a copy of the sentence around it**                                                  | The unread-mentions panel, without joining back to the text | Life of the project                                                                                   |
| `Project`                             | the customer's brief and budget; who manages it                                                                   | The work itself                                             | Life of the project — never swept                                                                     |
| `ProjectTemplate`, `ProjectTemplateItem` | who wrote the template, and its ticket text                                                                  | Starting a project from a repeatable shape                  | Until deleted by hand                                                                                 |
| `Team`, `TeamMember`, `ProjectMember`, `ProjectAccess` | who is in which group and on which project, and who granted access                             | Deciding who may see and be assigned what                   | Life of the membership                                                                                |
| `Workflow`, `WorkflowStatus`, `WorkflowTransition` | no personal data — status names, positions and rules                                                 | The board a project's tickets move across                   | Life of the install                                                                                   |

Not stored anywhere: payment card details, government identifiers, dates of
birth, location, health data, or anything about a website visitor who has not
signed in. There is no analytics and no third-party script.

**The password itself is never stored** — only a bcrypt hash. Nobody at the
studio can read a password, including whoever runs the server. One-time links
and API tokens are stored as SHA-256 hashes, so a database dump cannot be
replayed into account access.

**`Suppression` is the one deliberate exception**, and it is worth being blunt
about. Every other identifier the tracker keeps for a mechanical purpose is
hashed — `LoginAttempt` holds an HMAC of an email, not the email. The
suppression list holds the address as typed. A hash keyed on a rotatable secret
would, on the day somebody rotates that secret, silently re-permit mail to
everyone who had asked not to receive any. A privacy measure that can fail open
*into writing to people who said no* is worse than no measure, so this table
trades minimisation for the guarantee that actually protects the person.

## Who else gets it

Every one of these is optional and off until configured. What is actually on for
a given install is what `/portal/privacy` shows a customer.

| Recipient                                       | What reaches them                                                                                                                                             | When                                                                                | Your job                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Hosting provider**                            | the database and the uploaded files                                                                                                                           | always                                                                              | A processing agreement, and knowing which country the server is in                                                   |
| **SMTP provider**                               | recipient address, and the invite or reset link                                                                                                               | when mail is configured                                                             | An agreement; note that a reset link in an email is a credential in transit                                          |
| **Rocket.Chat**                                 | **the text of a customer's portal message**, verbatim, plus ticket titles and project names                                                                   | when the integration and _Client message_ are both on                               | If your Rocket.Chat is self-hosted this stays in-house; if it is not, it is a third party receiving customer content |
| **Git forge** (GitHub/GitLab)                   | nothing is sent — the tracker only receives                                                                                                                   | incoming only                                                                       | Nothing                                                                                                              |
| **The outreach SMTP provider**                  | the recipient's address and **the whole message**, for people who never asked to hear from the studio; and, coming back, **their reply, verbatim**                | whenever a campaign sends, and whenever somebody replies                            | A separate agreement. Deliberately separate credentials and a separate subdomain from the transactional mail server |
| **OpenRouter** and whichever model it routes to | project descriptions, ticket text, the chat thread including internal notes, **meeting transcripts** — everyone's speech, word for word, clients included — and, if outreach drafting is switched on, **the text of replies from people who never asked to be contacted** | only when someone presses a draft button; for project material, only for a project whose own switch is on; for outreach, only behind its own third switch | **See below — this is the awkward one** |

### The OpenRouter problem, stated plainly

OpenRouter is a **router**, not a model. It forwards the request to whichever
provider serves the model you named, and that provider can change. Article 28
expects you to name your sub-processors and to have a contract chain reaching
them; with a router in the middle, "we use OpenRouter" does not tell a customer
whose machine their brief was processed on. On top of that, OpenRouter is a US
company, so this is also a Chapter V transfer.

Three honest ways out, in order of how much they actually solve:

1. **Point it somewhere else.** `OPENROUTER_BASE_URL` accepts any
   OpenAI-compatible endpoint — a model on your own hardware, or a provider
   inside the EU. Then there is no router, no transfer, and nothing to disclose
   beyond your own infrastructure.
2. **Pin the model and get the chain in writing** from the provider, including
   which upstream serves it and whether prompts are retained or trained on.
3. **Leave it off.** It is off by default at the studio level and off again per
   project; a studio that never turns it on has nothing to disclose here.

**Meetings sharpen all of this.** A ticket description is something a colleague
wrote about the work; a transcript is what people actually said, attributed by
name, including the client and including whatever was said in passing. It is
the most personal material the tracker holds, and reading one sends it whole. So
uploading a meeting and having it read are deliberately two separate actions:
filing the transcript sends nothing anywhere, and the button that does is absent
unless both switches are on. If your answer to "may a customer's meeting leave
the building" is no, the transcript still files, and people read it themselves.

Whatever you choose, the tracker records every call — who, when, which project,
how many tokens — so the question "was this customer's material ever sent
anywhere" has an answer rather than an opinion.

### Cold outreach, stated plainly

Holding a list of people who have never contacted the studio is a different
kind of processing from everything else in this file, and the tracker cannot
make it lawful. What it can do is make the facts available to whoever has to
defend it.

**The basis is yours to establish.** Legitimate interest (Art. 6(1)(f)) is the
usual ground for business-to-business outreach, and it requires a balancing test
somebody actually writes down. PECR and the national ePrivacy rules differ by
country and are markedly stricter for individuals and sole traders than for
companies. None of that is a judgement software can make.

**Article 14 applies, not Article 13.** These people did not give the studio
their data, so they are owed — among other things — a statement of where it came
from, and they are owed it in the first message rather than on request. That is
why `Lead.sourceDetail` and `LeadImport.sourceDetail` are required by the forms
that create them: a row with no answer to "where did this come from" is a row
nobody can answer for. The public unsubscribe page shows the recipient that same
sentence.

**Objection is one click, and it is permanent.** Every lead has a stable
unsubscribe link derived from the server key. Pressing it writes a
`Suppression` row, which nothing removes on a schedule and which survives the
deletion of the lead itself. The list is checked before an address can be
imported again.

**A person approves the first message.** Nothing reaches anybody until somebody
has read the rendered text against a named lead and pressed a button. Later
messages in a sequence are templates that same person wrote and saved; the
scheduler substitutes tokens and sends, and never generates anything. There is
deliberately no path by which a model writes a message that goes out unread.

**Every outbound message carries, without exception:** an unsubscribe link, a
`List-Unsubscribe` header with RFC 8058 one-click, the studio's postal address,
and one sentence saying where the recipient's address came from. The renderer
appends all four rather than leaving them to whoever writes the template, so
there is no version of a campaign that can be saved without them. The scheduler
refuses to send at all while the postal address is unset.

**Suppression is re-checked at the moment of sending**, not only when a message
was queued. Somebody who unsubscribes today cancels a message that was
scheduled last week, and stops the rest of their sequence with it.

**Any reply stops the sequence**, whatever it says. A person who writes back is
talking to the studio, not to a schedule, and the machine gets out of the way
without waiting for anybody to read the words. A hard bounce or a spam
complaint reported by the provider suppresses the address outright; three soft
bounces do the same. Every one of those cancels what was queued for that person
**in every campaign**, not only the one they were in — replying to one is not
agreement to hear from another.

**A reply nobody can place does not become a lead.** If somebody writes and the
tracker cannot match them to a record, the message is stored with no person
attached and shown at the top of the inbox for a human. Creating a database
record of a stranger because they sent an email once would be exactly the
silent write this feature is otherwise careful to avoid.

**Attachments on inbound messages are not stored at all.** They stay in the
mailbox at the provider.

**Outreach mail leaves on its own transport.** `OUTREACH_SMTP_*` and a separate
sending subdomain, with no fallback to the server that carries invites and
password resets — the point being that a spam complaint about cold mail cannot
stop somebody resetting their password.

## How the rights are served

| Right                           | Where it is                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Access** (15)                 | `GET /api/people/<id>/export`. The person themselves from the account menu or the portal footer; an admin or manager for anyone, and that download is logged. A lead is not a `User` and that export cannot answer for one, so `GET /api/outreach/leads/<id>/export` exists alongside it and is logged the same way |
| **Portability** (20)            | the same file — JSON, so it can go somewhere else                                                                                                            |
| **Rectification** (16)          | ordinary edit forms: a person's own profile, the client's contact fields                                                                                     |
| **Erasure** (17)                | **People → the shield icon**, administrators only, confirmed by typing the email. Strips the identity in place and keeps the work; see README. A lead is deleted outright from its own page — diary, and every message ever sent to them, and all — **except its suppression row, which is kept on purpose**: removing it would let the next imported list write to somebody who had asked not to be written to. This is the standard suppression carve-out and it is recorded here so it is not read as non-compliance |
| **Restriction** (18)            | deactivate the account (the power icon) — they cannot sign in and receive nothing, while the record stays intact                                             |
| **Objection** (21)              | turn the project's model switch off; switch off the chat integration; both take effect immediately. For a lead: the unsubscribe link in any message, or the public form at `/unsubscribe`, either of which is permanent |
| **Automated decisions** (22)    | one, and it is described in full below rather than denied — see _What the model decides by itself_                                                           |

### What the model decides by itself

Until outreach existed, the honest answer here was "nothing". It no longer is,
so this says exactly what changed rather than leaving a row that used to be
true.

**The one autonomous act.** When somebody replies to a cold email, a person can
ask the tracker to read that reply. If the reading comes back *interested* with
*high* confidence, the tracker files an entry in the studio's own enquiry inbox
— the same inbox the public form feeds — without asking again.

**What that is not.** It does not contact anybody, does not answer the reply,
does not suppress or un-suppress an address, does not decide whether the studio
will work with them, and produces no number about them. Nothing leaves the
building: the entry is an internal row a project manager reads next.

**How it is fenced.** Both bars must be met, and either one short of it means a
person does it or nobody does. The entry is validated against the same rules a
member of staff is held to, so a malformed answer creates nothing at all. It is
stamped `createdByKind = MACHINE` and shown as such wherever it appears, so it
cannot be mistaken for something a colleague wrote. Both the lead's history and
the request's own history record that the tracker filed it, and the reply it
came from sits beside it.

**What the model is explicitly not allowed to do.** A reply the model reads as
"stop emailing me" does **not** write to the suppression list. Suppression comes
from the unsubscribe link, from a provider's complaint or bounce report, or from
a person pressing the button — never from a reading. Nothing is lost in the gap:
any reply at all stops that person's sequence the moment it arrives, so nothing
further goes out while somebody decides. The interface says so and asks a human
to act.

### What the software cannot do for you

Stated here so it is not discovered during an audit:

- **Free text other people wrote.** A colleague's comment naming someone is that
  colleague's text in a project's record. The command palette finds it; a human
  edits it.
- **Backups.** A dump taken before an erasure still holds the earlier state.
  Whatever retention you apply to backups is the real answer, and it is outside
  the app.
- **The lawful basis.** Contract, legitimate interest, consent — the tracker
  neither knows nor asks. Write it into _Your own wording_ on the settings page
  so customers see it.
- **Your processors' contracts.** Listing them here is not the same as having a
  DPA with each.

## Security measures (Art. 32)

What is actually implemented, not what would be nice:

- Passwords hashed with bcrypt; nobody ever types another person's password —
  accounts start unusable and the person sets their own through a one-time link.
- Sessions are a signed JWT in an httpOnly cookie; changing a password
  invalidates every session issued earlier.
- Sign-in is rate limited per account **and** per address, in the database so it
  survives a restart and holds across instances. The identifiers are HMAC'd, so
  the table holds no addresses.
- Every list, search, API call and file download goes through the same project
  scope check; the client portal enforces its per-project switches server-side,
  not by hiding sections.
- Incoming webhooks are HMAC-verified with constant-time comparison and refuse
  replayed deliveries.
- The server refuses to start on the example signing secret if it is reachable
  from outside; it warns about plain `http`.
- The container runs as a non-root user and carries no source, package manager
  or database CLI.
- The API returns a generic error to the caller and keeps the detail in the log;
  mail errors have addresses redacted before logging.

Not implemented, and worth knowing: no encryption at rest beyond whatever the
host provides, no S3 driver (files sit on a volume), no per-field encryption,
and no intrusion detection.

## When something goes wrong

The tracker gives you three things for a breach assessment: the `Activity` feed
(who did what), `AiUsage` (what was sent to a model provider and when), and
`ApiToken.lastUsedAt` (whether a machine token was used). Getting from those to a
notification within 72 hours is a process, not a feature — write it down before
you need it.
