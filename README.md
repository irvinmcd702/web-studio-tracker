# Studio Tracker

A project tracker for a web development studio: projects, a workflow builder, teams,
tickets with a board, a client chat, files, and budgets billed hourly or fixed-price.

Stack: **Next.js 15 (App Router) · React 19 · Prisma 6 · PostgreSQL 16 · Tailwind 4**.
Authentication is a self-contained JWT session in an httpOnly cookie (`jose` + `bcryptjs`).

## Which document you want

| You are                              | Read                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **using the tracker** to do your job | **`/help` inside the app** — not a file here, and in English or Russian depending on the browser. The people who use this every day do not have access to a private repository, so their guide ships with the software |
| building on it                       | this file: what every feature does and why it does it that way                                                                                                                                                         |
| putting it on a server               | [DEPLOY.md](DEPLOY.md) — one command, what it refuses to start without, deploying from GitHub, and what is still missing                                                                                               |
| writing an agent against it          | [API.md](API.md) — the JSON API and the MCP server                                                                                                                                                                     |
| answering a data question            | [PRIVACY.md](PRIVACY.md) — every table, every processor, and what the software cannot do for you                                                                                                                       |
| working on how it looks              | [DESIGN.md](DESIGN.md) for the system, [PRODUCT.md](PRODUCT.md) for the reasoning behind it                                                                                                                            |
| showing it to somebody               | [DEMO.md](DEMO.md) — five minutes, verbatim output                                                                                                                                                                     |
| picking up what was left             | [BACKLOG.md](BACKLOG.md) — work that is understood and costed, and waiting on a decision rather than on an idea                                                                                                        |

## Getting started

```bash
npm install
docker compose up -d     # PostgreSQL on localhost:5440
npm run db:deploy        # apply migrations
npm run db:seed          # demo data
npm run dev              # http://localhost:3000
```

Or, after `npm install`, in one go: `npm run setup && npm run dev`.

To run the real production build locally: `npm run build && npm start` — that serves the
standalone bundle, the same one the container runs.

**Deploying it properly is `DEPLOY.md`**: one command with `docker-compose.prod.yml`,
what the server refuses to start without, and what is still missing.

Configuration lives in `.env` (`DATABASE_URL`, `AUTH_SECRET`, `UPLOAD_DIR`, `APP_URL`,
and the optional `SMTP_*` block).
Postgres is mapped to port **5440** to stay clear of anything already on 5432–5434.

### Demo accounts (password `admin123` for all)

| Login               | Role            | What they see                          |
| ------------------- | --------------- | -------------------------------------- |
| `admin@studio.com`  | Administrator   | everything, including project deletion |
| `pm@studio.com`     | Project manager | projects, clients, teams, workflows    |
| `dev@studio.com`    | Team member     | only their own projects and tasks      |
| `design@studio.com` | Team member     | same                                   |
| `client@acme.com`   | Client          | portal: their project, chat, files     |

## Design

The interface is a quiet tool: neutral surfaces, thin lines, one accent, and colour
spent only where it means something (status, priority, budget pressure, the current
selection). **Light and dark are both first class** — the toggle sits in the sidebar and
in the portal header, the choice is remembered per person, and it follows the operating
system until someone picks a side.

There are no `dark:` classes anywhere. Every component reads semantic custom properties
(`--color-surface`, `--color-ink-2`, `--color-brand`, `--color-warn`…) defined once per
theme in `app/globals.css`, so a new screen is theme-correct by construction. Colours a
user picked and the database stores — workflow statuses, teams, avatars — are mixed into
the current surface rather than painted raw, which is what keeps a pale amber status pill
readable on both themes.

Contrast is measured in the browser rather than assumed: body text clears 4.5:1 and large
text 3:1 on every page in both themes. Numbers are set in tabular figures so hours and
money line up down a column.

Every route has a **skeleton** shaped like the page it is loading, phones get row lists
instead of tables dragged sideways, and **nothing irreversible happens on one click**:
delete asks in place, next to the button, never through a browser dialog.

A fresh install opens on a four-step setup card instead of four zeroes, the palette,
modal and lightbox trap the keyboard like real dialogs, and a printed report carries its
own letterhead: what it is, which period, which client, generated when.

`DESIGN.md` documents the full system (palette, type scale, components, motion) and
`PRODUCT.md` the strategy behind it.

## For coding agents

The studio writes code with AI, so the tracker is addressable by one. A small JSON API
under `/api/v1` plus an MCP server in `mcp/` let an agent list the tickets assigned to its
owner, read a project's whole context as markdown, move a ticket through the workflow,
comment, and log its hours.

A token **acts as the person who issued it** and inherits their project scope
exactly — an agent never sees more than the developer who granted it, and the
same workflow conditions that refuse a person refuse the agent, with the same
sentence. Hours logged through an agent token are stored as agent work rather
than passed off as somebody's own.

Every ticket carries **acceptance criteria** — a markdown checklist saying what "done"
means — and a **Copy as prompt** button that assembles the ticket, those criteria, the
project-context URL, the legal transitions and how to report back into one block. A
workflow transition can require the criteria before a ticket moves on. **That button
calls nothing and sends nothing** — it writes down what the tracker already knows for a
developer to paste into whatever agent they use, and it works on every project, including
the ones that allow no drafting at all. Where the tracker _does_ call a model is a
separate, opt-in feature — see **Drafting with a model** below.

Hours an agent logs are recorded as agent work, always. **Showing** the split is
optional in two independent places: a studio switch adds it to the project budget, the
reports and the CSV export, and a per-project portal switch (off by default) tells the
client. Turning either off hides a breakdown; it never changes what was recorded, and it
never changes the bill — the split is information, not a discount.

Git closes the loop from the other side: a branch or pull request naming a ticket
comments on it with the link and, if the studio configured it, moves it. The event acts
as **the person who pushed**, matched by commit email or their git username, so a merge
is subject to the same transition conditions as a click — a developer cannot release by
merging if releasing is admin-only.

See `API.md` for the endpoints and the MCP setup, `DEMO.md` for a five-minute
walkthrough. Tokens are issued at **/tokens**.

## Features

### Projects

Created from scratch (`/projects/new`) or **from a client request** — the description,
contacts and attachments carry over and the request is marked as converted. A project
carries a key used for ticket ids (`ACME-14`), a client, a PM, dates, a status, a
workflow, a crew and a budget.

### Client requests

`/requests` is the intake funnel (`New → In review → Accepted → Converted`).
There is a **public form** at `/intake` with no authentication — embed it on the studio
site. A client record can be created from a request's contact details in one click.

### Workflows

`/workflows` holds any number of independent status sets. Each status has a colour, a
category (`To do` / `In progress` / `Done`) and a position; exactly one is the initial
status. **Transitions** declare which moves are legal; a transition with no source
applies "from any status". With no transitions at all, movement is unrestricted.

Workflows can be duplicated and swapped on a project: tickets move to a status with the
same name, otherwise to the first status in the same category.

**Visual builder.** `/workflows/[id]` opens the process as a diagram (React Flow): drag a
status to position it, pull from the right edge of one node to the left edge of another
to draw a transition, click an arrow to open its rules. Arrows are colour-coded — grey is
plain, dashed amber carries conditions, violet carries hooks — and the label lists what
each one does. A dashed **Any status** node is the origin for catch-all arrows.

Coordinates live on the status (`canvasX`/`canvasY`) separately from `position`, which
still drives board column order, so the diagram can be rearranged without reshuffling the
board. A workflow that has never been laid out is arranged into a grid on read, so
processes created before the builder existed don't pile up in one corner.

**Conditions** gate a move; all must hold or it is refused with the reason:

| Condition                                                                      | Meaning                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Allowed roles                                                                  | only these roles may use the arrow (none = anyone on the project) |
| Only the assignee                                                              | the mover must be the ticket's assignee                           |
| Must have an assignee / estimate / description / acceptance criteria / comment | the ticket must be that complete                                  |
| Only once the ticket has been in _X_                                           | the one condition about the **past** rather than the present      |

**Arrows are arbitrary.** A workflow is a directed graph, not a chain: draw an arrow from
any status to any other and that move becomes legal. Two steps back, five steps forward,
straight from the backlog to released — the builder does not care, and neither does
`isTransitionAllowed`. The buttons on a ticket are exactly the arrows leaving its current
status.

That is what makes the last condition useful. An **optional shortcut** is an arrow that
skips a step, open only to a ticket that has already taken it: draw
`In development → Client approval`, set _only once the ticket has been in QA_, and the
first pass has to go the long way while a returning one may skip it. Which is the shape
people actually mean by "the second time round we don't need to test it again".

It works because every move is recorded in `TicketStatusChange` — structured, not the
activity feed's prose, which changes when somebody renames a status. Two consequences
worth knowing: there are **no foreign keys** from that table to the statuses, so editing
a workflow cannot erase what happened; and **history starts when this was deployed**,
so a ticket moved before then looks as though it has been nowhere. The condition's own
hint says so where it is set.

**Hooks** run after a successful move: assign to the mover, clear the assignee, set
priority, show/hide in the client portal, post a comment, announce in Rocket.Chat, or
`POST` the event to a webhook.

Two rules worth knowing:

- A specific `A → B` arrow always wins over a catch-all `any → B`, so a targeted rule is
  never silently disabled by the fallback.
- Conditions are enforced in `moveTicketAction`, not in the UI — the board, the ticket
  page and any other caller all go through the same check. Hooks run **after** the move
  and are best-effort: one failing hook is recorded in the activity log rather than
  rolling the transition back, because the move already happened.

Webhook URLs are restricted to `http(s)` and are configured by admins and managers only —
treat them as you would any outbound request from your server.

### Crews and teams

**A project's crew is picked person by person.** When you create a project you tick the
people who will actually work on it — staffing by attaching a whole department was never
how the studio works, and it handed access to people with nothing to do with the project.
Each person carries a role for that project ("Backend", "Tech lead", "UI"), so the same
developer can be a lead on one project and a pair of hands on another.

The crew is what grants a member access to the project and what makes them assignable on
its tickets. While it is still empty the project stays open to any staff member, so a
project created in a hurry is usable before anyone gets round to staffing it.

`/teams` is the standing directory — Frontend, Backend, Design — of who does what in the
studio. Teams are a **source of names, not an access rule**: on the create form each team
is a chip that ticks all of its people at once, and project settings has an _Add everyone
from a team_ shortcut. After that the project holds the names. Changing a team later does
not reach the project, and deleting a team leaves every crew intact.

### Tickets and the board

A kanban board built from the workflow statuses: drag cards **or** use the move button on
a card (which also works on touch devices). Illegal transitions are blocked on both the
client and the server. A ticket carries a type, priority, estimate, due date, assignee,
comments, files, logged time, a change history and a "visible to client" flag.

### Time tracking

Two ways in, one store — every route ends up as a `WorkLog` row, which is what the budget,
the reports and the Rocket.Chat threshold alerts read.

**Timer.** Each ticket has a start/stop stopwatch with an optional note. Only one runs per
person: starting a second closes the first and logs it. A running timer shows in the
sidebar on every page with a live clock and a stop button, so none is left ticking
overnight. Sessions under a minute are discarded rather than written as junk entries, and
elapsed time is rounded to whole minutes.

**Timesheet.** `/timesheet` is a Mon–Sun grid of the tickets you touched that week, with
per-day and per-week totals and week-to-week navigation. Cells are edited in place:
typing a number updates the entry, clearing it deletes the entry, and a day with no entry
creates one. Days over 12 hours are highlighted.

A cell holding **several** entries is deliberately read-only — writing one number there
would merge separate notes into one and lose them; those are edited on the ticket. The
side panel adds an entry for any ticket you're assigned to or reported.

### Client chat

`/projects/[id]/chat` is the PM ↔ client conversation. **Internal notes** are visible to
studio staff only. The client replies from their portal; both sides poll every 15 seconds.

### Files

Attach to a project, a ticket, a request or an approval stage. Stored in `uploads/`
(outside `public/`) and served through `/api/files/[id]` with an access check. Each file
has a client-visibility flag.

**Images and video get previews.** One `AttachmentList` component renders every
attachment surface: media appear as a thumbnail grid and open in a full-screen viewer
(arrow keys and Escape work, and it pages only through the media of that list), while
anything else stays a plain file row with an extension tile. Download is available from
both.

Thumbnails are the originals scaled by CSS with `loading="lazy"` — no image pipeline is
involved. That is fine for the file volumes a studio deals with; if projects start
carrying dozens of large photos, a resizing step is the thing to add.

Serving is hardened in a few ways worth knowing:

- **Byte ranges** are supported (`206` with `Content-Range`, `416` when out of bounds).
  Video cannot load metadata or seek without them.
- **SVG and HTML are never served inline** — they are documents that can carry script and
  would run in this origin. They are always handed over as downloads and are excluded
  from the preview grid.
- Every response carries a sandboxing `Content-Security-Policy` and `nosniff`, so a file
  opened directly has no script, no plugins and no same-origin privileges.

### Budget

Two modes:

- **Hourly** — an hour cap plus a rate; progress is computed from logged time (`WorkLog`)
  and overruns are highlighted.
- **Fixed price** — a contract amount; hours are still tracked.

`/projects/[id]/budget` breaks the numbers down by person, by ticket, and lists every
time entry.

### Stage approvals

The thing that ends "we never agreed to that" arguments. Each project has stages —
a design, a milestone, a release — that the client signs off on, at
_Project → Approvals_ and in the portal.

Lifecycle: `Draft → Awaiting client → Approved / Changes requested`. A draft is
studio-internal and never reaches the portal. Sending it makes it visible; the client
either approves or sends it back **with a mandatory comment** explaining what to change.
Fixing and re-sending clears the previous decision and starts a clean round.

Every decision records **who** decided and **when**, and the comment is kept. Staff can
record a decision that arrived by phone or email — it is then attributed to that staff
member and labelled "recorded by the studio", never disguised as the client's own click.

A stage can carry a value for staged billing and a respond-by date, and files attached to
it are what the client is being asked to accept — those ride on the approvals switch, so
they stay reachable even when the general files section is hidden. The project tab shows
a badge when the client has sent something back, and the decision goes to Rocket.Chat.

### Docs

Briefs, specifications, meeting notes and access instructions, kept next to the work
instead of in a chat scroll or someone's drive. `/docs` lists them grouped by project,
with a _Studio_ group for material that belongs to no single project — how we estimate,
how we hand over, the onboarding note for a new developer. Each project also has a
**Docs** tab.

Written in **Markdown** with a Write / Preview switch: headings, lists, tables, links,
code and task lists. It is rendered through `react-markdown` with raw HTML left disabled,
so a pasted `<script>` stays text on the page instead of running.

A doc is internal by default. **Share with the client in the portal** puts it in the
portal's _Documents_ section — and only if the project's _Documents_ switch is on as
well, so nobody can share a doc into a portal that is meant to be quiet. The project tab
says so plainly when a doc is marked as shared but the portal switch is off.

Docs follow the same visibility rules as everything else: a member sees studio docs plus
the docs of projects they work on, a client sees only what was deliberately shared. Docs
are searchable from the command palette, by title and by body text.

### Reports

`/reports` (admins and managers) turns logged time into money for a period — the thing
you need at month end to raise an invoice or hand a client an act of work.

Pick a period (this / last month, this / last quarter, this year, or a custom range),
optionally narrow by client or project, and get:

- **By project** — hours and billable amount per project, with per-currency totals.
- **By person** and **by ticket** — shown once a single project is selected.
- **Time entries** — every row behind the totals, so the numbers can be defended.

Money follows the billing model honestly: an hourly project bills `hours × rate`, while a
**fixed-price project reports hours but no per-period amount** — there is no defensible way
to split a contract sum across days, so the cell shows the contract value instead of a
guess, and it is excluded from the billable total. Totals are grouped **by currency** and
never summed across them.

Export is **CSV** (UTF-8 with BOM, so Excel opens it correctly) or **Print** — print styles
strip the navigation and buttons and keep table rows from splitting across pages.

### Client portal

`/portal` is a separate surface: only their own projects, tickets flagged as
client-visible, permitted files, the chat and budget progress.

**Everything on it is configurable per project** under _Project → Settings → Client
portal_. Twelve switches, each enforced server-side rather than merely hidden in the UI:

| Switch                      | Controls                                                                  |
| --------------------------- | ------------------------------------------------------------------------- |
| Project description         | the scope text from the project card                                      |
| Dates and deadline          | start / due date in the portal header                                     |
| Task list                   | the tickets section (only client-visible tickets are ever listed)         |
| Chat with the manager       | the conversation; off also rejects a client's `POST`                      |
| Files                       | the files section; off also makes `/api/files/[id]` return 403            |
| Let the client upload files | the upload form; off also rejects the upload action                       |
| Hours                       | logged hours, the hour budget and its progress bar                        |
| Money                       | billed amount, rate and contract value                                    |
| Team members                | who from the studio is on the crew                                        |
| Stage approvals             | the sign-off section; off also rejects a client's decision                |
| Documents                   | the docs section; only docs marked as shared are ever listed              |
| Agent hours, separately     | tells the client how much of the logged time was done with a coding agent |

Turning off _Files_ greys out _Let the client upload files_ — uploads have nowhere to go
without the section. Hidden sections are not queried at all, so their data never reaches
the client's HTML. Attachment responses are sent `no-store`, so revoking access takes
effect immediately instead of lingering in the browser cache.

The seeded fixed-price project (`TPROM`) ships with hours hidden and the team shown, as
an example of a non-default configuration.

**Defaults for new projects** live at `/settings` (_Studio settings → Client portal
defaults_, admins and managers only). They are copied into a project at creation time, so:

- a new project starts with the studio configuration instead of the built-in one;
- whoever creates the project can override any switch right on the create form;
- changing the defaults later never rewrites projects that already exist.

### Rocket.Chat notifications

Outgoing only — the tracker posts, it never reads your chat. Configured at `/settings`
(_Studio settings → Rocket.Chat_).

Set-up on the Rocket.Chat side is a single **incoming webhook**
(_Administration → Integrations → New → Incoming_); no admin API token or bot user is
needed. Paste the webhook URL into the tracker, pick a default channel, choose the
events, and hit **Send test message** to confirm delivery.

| Event                                             | Goes to         | Default     |
| ------------------------------------------------- | --------------- | ----------- |
| New client request (intake form or added by hand) | default channel | on          |
| Client wrote in the portal chat                   | project channel | on          |
| Project created                                   | project channel | on          |
| Ticket assigned (only when the assignee changes)  | project channel | on          |
| Ticket moved between statuses                     | project channel | off — noisy |
| Budget passed 80% / 100%                          | project channel | on          |
| Client approved a stage or asked for changes      | project channel | on          |

Routing: each project has its own **Rocket.Chat channel** field in its settings; anything
without one falls back to the studio default channel. One webhook serves every channel —
the `channel` field on the payload does the fan-out.

Notes:

- The budget warning fires **once per mark**. The level reached is stored on the project,
  so logging more hours doesn't repeat it — and raising the budget lets it fire again.
- Delivery never blocks or breaks a user action: failures are swallowed, and the last
  result (ok / error, with timestamp) is shown on the settings page.
- The stored webhook URL is a secret and is never echoed back to the browser. Submitting
  the field blank keeps the existing URL.
- `APP_URL` in `.env` is what the links in the messages point at — set it to the address
  your team actually opens.

### Drafting with a model

Optional, off by default, and useful in exactly one shape: **a draft a person then
decides on.** The model never produces a number, never writes to a ticket, never moves
anything and never answers a client.

| Where                        | What it drafts                                                                   | From                                        |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------- |
| A ticket, under _Done means_ | acceptance criteria as a checklist                                               | the ticket text and the project scope       |
| A project's chat             | a catch-up — where it stands, who is waiting on whom, what was decided           | the message thread, internal notes included |
| An incoming request          | scope as understood, a first list of tickets, and **what to ask before quoting** | the enquiry as it arrived                   |

Acceptance criteria land in an editable box; nothing reaches the ticket until somebody
presses Save, and the activity feed records it as that person's edit, because it is. The
other two are text on a screen with a Copy button and nothing else.

**Three switches, all off until someone turns them on:**

1. `OPENROUTER_API_KEY` on the server. Without it the buttons do not exist.
2. The studio switch at `/settings` — _Drafting with a model_.
3. Each project's own switch in its settings. Existing projects keep theirs; new ones
   start from a studio default that is itself off.

The per-project one is the point: the studio decides it is willing, and each client's
project decides separately whether its material may go. Both are enforced server-side —
`lib/ai.ts` re-checks before sending, so a call site that forgets still cannot leak.

**What leaves the building** is the material being drafted from, and nothing else. Hours,
rates, money and the contact's name, email and phone are never in any prompt — that is
asserted by a test, not just intended. Every call is recorded with tokens, cost, who
asked and which project, and the 30-day totals sit on the settings page: a studio paying
per token can see what it paid for, and a studio that sent a client's brief somewhere can
say when and for whom.

`OPENROUTER_BASE_URL` points the whole thing at any OpenAI-compatible endpoint — a proxy
on your own network, or a model on your own hardware — for studios whose answer to "may
this leave the building" is simply no.

Separate from all of it: **Copy as prompt** on every ticket still calls nothing and sends
nothing. It writes down what the tracker knows so a developer can paste it into whatever
agent they use, and it works on projects that allow no drafting at all.

### Meetings

A transcript goes in; what was discussed, what was decided and what somebody agreed to do
comes out. Zoom, Meet and Teams each write a caption file, and `lib/meetings.ts` reads all
three — timestamps and cue identifiers dropped, consecutive lines from one person joined,
because caption files break on breath rather than on thought. Anything that is not a
caption file passes through untouched: somebody's own notes are a transcript too.

**Filing and reading are two actions, deliberately.** Uploading sends nothing anywhere.
Reading is a button, behind the same two switches as every other draft — the studio's, then
the project's — and a transcript is the most personal material the tracker holds, so the
button is absent rather than disabled when either says no. The transcript is still filed,
and people can read it themselves.

The summary is stored **beside** the transcript, never in place of it, and the panel says
outright that where the two disagree the transcript is right. Four lists come back —
discussed, decided, to do, left open — and any of them may be empty. A meeting that decided
nothing is a real meeting; reporting a decision it did not take is worse than reporting
none.

Actions arrive as **unticked checkboxes**. Ticking some makes tickets through the same
`insertTicket` a hand-made ticket uses, so numbering, initial status and the activity trail
are identical. Nothing is assigned: the model heard a first name in a room, which is not
the same as knowing whose account that is. Each ticket keeps a link back to the meeting,
because six months later the useful question about a ticket is why it exists.

A transcript too long to send whole is cut in the **middle**, not the end — a meeting says
what it settled as it finishes — and the cut is reported on screen rather than hidden. A
summary of two thirds of a conversation presented as a summary of the conversation is the
kind of quiet wrongness nobody catches until it matters.

Transcripts have their own retention period on the settings page, dated by when the meeting
was held rather than when somebody uploaded it. Deleting one leaves the tickets that came
out of it alone: work that was agreed does not evaporate because the recording of agreeing
it reached its date.

### Mentions

`@dana, can you look at this` — in a ticket comment or a project's chat. The third thing
worth taking from ClickUp, and the one the tracker most obviously lacked: a whole
notification layer existed with no way to point at one person.

Everyone has a **handle** — short, lowercase, unique, on their profile. Backfilled from the
email's local part, editable, and deliberately not the email itself: an address changes
when somebody marries, and a mention written last year should still point at the same
person.

Two rules shape the rest:

**A mention only reaches somebody who could already see the thing.** Handles resolve
against the people with access to that project — its crew, its manager, anyone holding one
of its tickets, and whoever sees every project anyway. Typing `@ivan` on a project Ivan is
not on creates nothing at all. It has to work that way round: a short excerpt travels with
the mention, and an excerpt is a piece of a client's ticket.

**Portal users are not mentionable.** They have no dashboard to see it on, and a
notification that half works is worse than an honest absence. A client _writing_ can still
mention studio people — that is the point of a shared thread.

Being mentioned appears at the top of **Needs attention** on the dashboard, and in the
daily digest, because it is the same signal pipeline. It clears when you open the ticket
or the chat you were named in. It is never shown to the project manager: being named is
between two people, not a queue somebody supervises.

Typing `@` opens the people you can name, searchable by name as readily as by handle —
nobody has to have learned a handle to use this. What it offers is exactly who the mention
would really reach: the same project-scoped list the server resolves against, minus
yourself, because naming yourself notifies nobody. Offering a name that silently goes
nowhere would be the interface lying, and mentions are precisely the feature where nobody
finds out for a week.

The list comes in two parts. **On this project** is the crew, the manager, and whoever
holds one of its tickets — the people meant nearly every time. **Sees every project** is
the administrators and managers who can read it by role without being on it. Both may be
named, and escalating to a manager who is not on the crew is a real thing people need to
do; but on a project of three in a studio of eight managers, one flat alphabetical list
buries the three under strangers. The second heading appears even when it holds the only
match, because that label is the point: it says this person is not on the project.

The portal has no picker. A client can still mention studio people by typing a handle they
know, but handing the customer a roster of everyone on the project is a disclosure the
project's own switches should decide, not the composer.

Handles are highlighted in the text **only when they resolved** — `@nobody` stays plain,
because highlighting a mention that went nowhere would be the interface claiming something
it did not do. Erasing a person scrambles their handle along with their name, so an old
`@dana` stops pointing at Dana.

Mentions are recorded in `commentOnTicket`, not in the form action, so a comment posted
through the API or by an agent notifies exactly the same people.

### Project templates

The same shapes come round again — a landing page, a shop, a retainer — and each time
somebody types the same twelve tickets. `/templates`.

A template is made by **saving a project that went well**, not by filling in a blank form.
A studio's best template is a job it has already done, and the tickets it actually needed
are already sitting in it. Open any project's settings → _Save as template_.

**Travels:** every ticket with its description, acceptance criteria, type, priority and
estimate, plus the workflow, how the project was billed and what the client could see.

**Does not, on purpose:**

|                        | Why                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Assignees              | work goes to whoever is on the _next_ crew; a template that hands a ticket to somebody who has left is one people learn to distrust |
| Statuses               | everything starts where the workflow starts — pre-placing work in QA describes progress that has not happened                       |
| Dates, as dates        | kept as _"so many days after the project starts"_, and only where the source project had a start date to measure from               |
| Hours, comments, files | those belong to the job that was done                                                                                               |

Using one prefills the new-project form and creates the tickets **after** the project
exists, so they inherit whichever workflow was actually chosen — changing your mind on the
form changes what you get. The dialog says all of this before it asks for a name, because
finding out afterwards is how a feature stops being trusted.

### Workload

`/workload`, administrators and managers. The weekly question a studio actually asks —
_can we take this on?_ — answered from numbers the tracker already held and had never
added up.

**The rule, stated once so nobody has to guess it:** a ticket's **remaining** hours — its
estimate less what has already been logged — sit in **the week it is due**. Nothing is
spread across the weeks in between. Spreading would invent a schedule nobody agreed to,
and this view is only worth having if any figure in it can be checked against a ticket.

Three things therefore refuse to become hours in a week, and get their own column:

|                 | Why it is not in a week                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| **Overdue**     | it should already have happened; folding it into this week would quietly reschedule it |
| **No date**     | it has to happen sometime, but nobody has said when                                    |
| **No estimate** | a count of tickets, never hours — a guess would look exactly like the real numbers     |

Open work with no assignee is gathered at the bottom rather than dropped: it is somebody's
week, just not decided yet.

Capacity is **hours in a normal week** on each person's profile. It decides only when a
cell turns amber or red; nothing is ever measured against it and no timesheet is judged by
it. Zero is allowed and means what it says — somebody on leave has no week, which is not
the same as an easy one.

### Deadlines and reminders

A **Needs attention** panel on the dashboard, and an optional once-a-day summary. Every
rule is arithmetic over dates already in the database — nothing is predicted, and every
line can be checked against the ticket it came from.

| Rule                       | Fires when                                            | Addressed to                             |
| -------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| Overdue ticket             | past its due date, not done                           | the assignee — the PM if nobody holds it |
| Due soon                   | inside the warning window                             | the assignee                             |
| Stalled work               | in progress, untouched **and** no time logged since   | the assignee                             |
| Overdue / imminent project | past or near the project deadline                     | the PM                                   |
| Approval waiting           | pending with the client past the threshold            | the PM                                   |
| Unanswered client message  | the client wrote last and nobody replied              | the PM                                   |
| Burn rate                  | on this pace the budget runs out before the deadline  | the PM                                   |
| Timer left running         | someone's stopwatch has run longer than the threshold | that person only                         |

Configured at `/settings` (_Studio settings → Deadlines and reminders_). Each rule is a
single number and **zero switches it off** — there is no second toggle that can disagree
with the threshold beside it.

Who sees what: everything above lands on the dashboard of the person it names. Developers
get their own deadlines; the project-running items (approvals, client silence, budget
pace) go to the project's manager, or to the admins when a project has none. Managers and
admins additionally see the project-level items for every project in their scope.

The **daily digest** is off by default and has two channels that are not the same message:

- **Email** — one letter per person, containing only what is addressed to them. Client
  portal users are excluded; none of this is theirs to chase.
- **Rocket.Chat** — one studio note in a channel, project-level items only. An incoming
  webhook can reach a channel but not a person, and broadcasting one developer's overdue
  tickets to the whole office is not a feature.

Sending is triggered by cron rather than a timer inside the process — see
[DEPLOY.md](DEPLOY.md#the-daily-digest). **Email me a preview** on the settings page
sends the letter to whoever pressed it and to nobody else.

### Personal data: erasure and export

Two things a tracker holding people's data has to be able to do, and one honest statement
of what it cannot.

**Erasing a person** (`/people`, administrators only) removes the name, email, position,
forge login, password, every session and every API token, and cuts a portal user loose
from their company. The account can never be signed into again.

It **keeps** the logged hours, comments, chat messages and uploaded files, attributed to
an account with no name. That is deliberate rather than a shortcut: those rows are a
client's billing record and a project's history, they have their own reason to be kept,
and half of them are wired `onDelete: Cascade` — a real delete would take the invoices
with it. The dialog says what survives before it asks for confirmation, and the email has
to be **typed**, because a stray click on the wrong row of a list of colleagues is exactly
how this goes wrong.

The erasure is recorded in the activity feed **without writing back what it erased**: the
entry names the administrator who did it and a pseudonym like `anon-4f2c91`, never the
person. Asserted by a test.

**Exporting a person** (`GET /api/people/<id>/export`) hands back every row that
references them as JSON — account, memberships, tickets, hours, comments, chat, files,
tokens, activity, model usage — plus the contact details held against a portal user's
company. JSON rather than a PDF on purpose: a file you can only look at answers "show me
what you have" but not "give me it in a form I can take elsewhere".

Secrets are excluded **by never selecting them**, not by deleting them afterwards, so no
later edit can leave one in. Each person can fetch their own from the account menu —
_Download my data_ — without asking anybody; admins and managers can fetch anyone's, and
that download is itself logged.

**What neither reaches**, stated in the export file itself rather than left to be
discovered: text other people wrote. If a colleague typed the person's name into a
comment, it is in that comment — the command palette will find it, and somebody has to
edit it by hand. Backups taken earlier still hold the earlier state.

### The privacy notice customers actually see

`/portal/privacy`, linked from the footer of every portal page, because a notice nobody
can reach is not a notice.

It is **generated from the live configuration**, not typed once and left to rot. A notice
is a promise about what a system does; writing that promise by hand makes it true on the
day it is written and unverifiable afterwards. So the page works out for itself who really
receives a customer's data — the host always, the mail provider if SMTP is configured,
Rocket.Chat **only if the integration and the _Client message_ event are both on**, and
the model provider **only for projects whose own switch allows it**, naming the projects.
It states the retention periods actually configured, and the customer's own **Download my
data** button sits on it.

Three things it cannot work out are entered at `/settings` (_Who answers for the data_):
the studio's legal name, an address for requests, and the studio's own paragraphs about
lawful basis. Until they are filled in the notice says so, rather than inventing a
controller.

The internal counterpart is [PRIVACY.md](PRIVACY.md): every table and what personal data
is in it, every processor, what the software cannot do for you, and the measures actually
implemented. Including an honest section on why routing a model through OpenRouter makes
naming your sub-processor hard, and the three ways out.

### How long things are kept

Two kinds of period, and the difference is the design.

**Fixed**, for tables that exist to make the software work. Nobody has a reason to keep
them and nobody should have to decide:

|                      |                                                               |
| -------------------- | ------------------------------------------------------------- |
| Sign-in counters     | 24 hours past their window, unless still holding somebody out |
| Spent one-time links | 30 days after expiry                                          |
| Webhook delivery ids | 7 days                                                        |

**Chosen**, at `/settings` (administrators only), for the studio's own history — the
activity feed, client chat, and the model usage log. Each is a number of days and **zero
keeps it forever**, which is what all three start at, so installing this deleted nothing.
The screen says outright that leaving them at zero is itself a decision: if you are asked
how long you keep a customer's messages, _"forever, we never decided"_ is the answer you
would be giving. **What would the next sweep remove?** counts without deleting, because
"keep chat for 90 days" is a setting whose consequences you want to see before you save
it.

Projects, tickets, logged hours and files are never touched by any of this. They are the
record of what was done and billed; deleting them on a timer would be destroying accounts,
not minimising data.

The sweep runs from the daily cron, **before** the digest and independently of it —
throwing away what should not be kept must not depend on somebody having switched a
mailing on, nor be skipped by the digest's twice-a-day guard.

**The sign-in counter table holds no addresses.** A limiter needs to recognise the same
visitor twice, which a keyed hash does perfectly well; it does not need to know who they
are. The email and the IP are HMAC'd with `AUTH_SECRET` before they are written, so what
lands in the database is `ip:9f3c…` — enough to count against, useless to anyone reading
the table, and nothing to erase later. Rotating `AUTH_SECRET` therefore resets every
lockout, which is the right way round.

## Command palette

`⌘K` / `Ctrl K` anywhere in the studio interface — or the **Search** button at the top of
the sidebar, because a shortcut nobody knows about helps nobody.

- Opens on an empty query with what you probably want: tickets assigned to you, then
  recently touched projects.
- Typing searches projects, tickets, docs, requests and — for admins and managers —
  clients, people, teams and workflows, all in one list.
- A ticket key is recognised: `ACME-4`, `acme 4` and `acme-4` all jump straight to that
  ticket under an **Exact match** heading.
- Navigation commands and **New project** are matched locally, including by keyword —
  typing `invoice` finds Reports, `process` finds Workflows.
- `↑` `↓` to move, `↵` to open, `Esc` to close. Requests are debounced and a stale
  response can never overwrite a newer one.

Search runs through the same `projectScope` as every page, so it cannot become a side
door: a team member sees only their own projects and no configuration areas at all, the
endpoint returns 403 for client-portal users and 401 for anonymous callers.

## Accounts and sign-in

**Nobody ever types someone else's password.** Creating a person or inviting a client
produces a **one-time link** instead; they choose their own password at
`/set-password/<token>`. Only a SHA-256 hash of the token is stored, so a database dump
can't be replayed into account access.

- Invite links last 7 days, reset links 2 hours; issuing a new one voids the previous.
- A link works once. After use it is marked spent and any other outstanding link for that
  account is deleted.
- Setting a password **signs out every other session** on that account — sessions carry
  their issue time and are rejected if older than the account's last password change.
  Disabling an account does the same.
- A client who hasn't set a password yet shows as **invite pending** on the client page,
  with a button to reissue the link.

Sign-in is **rate limited**: 5 failed attempts within 15 minutes locks that account for
15 minutes, and the counter is kept per email _and_ per client address, so rotating IPs
doesn't get more guesses and one attacker can't lock out a whole office. Counters live in
Postgres rather than memory, so the limit survives restarts and holds across instances.
While locked, even the correct password is refused.

Two caveats worth knowing:

- The client address comes from `x-forwarded-for`, which is only as trustworthy as your
  proxy. If the app is exposed directly, that header can be spoofed and the per-IP half
  of the limit is decorative — the per-email half still holds.
- There is **no email transport**, so links are handed to the operator to pass on rather
  than mailed to the person. `/forgot-password` therefore doesn't exist; a user who is
  locked out asks a manager for a fresh link. Adding SMTP would turn the same token
  machinery into self-service without further changes.

`APP_URL` is what the generated links point at — set it to the address people actually
open, or you'll hand out links to `localhost`.

## Permissions

|                                                    | ADMIN | MANAGER                   | MEMBER                    | CLIENT                |
| -------------------------------------------------- | ----- | ------------------------- | ------------------------- | --------------------- |
| All projects                                       | ✔     | ✔ (bar closed ones)       | own only                  | own company only      |
| Closed projects                                    | ✔     | only if on them or let in | only if on them or let in | own company only      |
| Create / edit projects                             | ✔     | ✔                         | ✔                         | —                     |
| Delete a project                                   | ✔     | —                         | —                         | —                     |
| Workflows, teams, clients, people, studio settings | ✔     | ✔                         | —                         | —                     |
| Reports and CSV export                             | ✔     | ✔                         | —                         | —                     |
| Tickets, comments, time logging                    | ✔     | ✔                         | ✔                         | —                     |
| Project chat                                       | ✔     | ✔                         | ✔                         | ✔ (no internal notes) |

A `MEMBER` can reach a project if they are its PM, are on its crew, are the assignee on at
least one of its tickets, or have been let into it by name (`lib/permissions.ts`).

### Closed projects

A project can be **closed**, and then a manager no longer sees it merely for being a
manager. It stays visible to its crew, its PM, anybody holding one of its tickets, and
anybody added to its list by name. That list is a table of its own rather than the crew:
putting a second manager on the crew to give them a look would place them in the workload
figures and the assignee menus, which is a lie about who is doing the work.

The switch also reaches the mention picker. On a closed project a manager stops being
nameable — `mentionableOn` drops the blanket role — because the excerpt travels with the
mention, and it must not arrive at somebody who cannot open the ticket it was cut from.

**Administrators are not excluded, and the settings page says so by name.** They hold the
database, the backups and everybody's password reset; a switch claiming to hide a project
from them would be describing a wall that is not there, and false comfort about who can
read something is worse than none — people write things down differently when they believe
nobody is looking. The duller reason is just as real: somebody has to be able to unlock it,
and a flag that could shut out every last person able to change it would eventually strand
a project nobody could reopen. If material must not be readable by an administrator, it
does not belong in the tracker.

Closing a project puts the person who closed it on the list, so a manager who is not on the
crew cannot shut the door behind themselves. The client sees no difference: this closes the
studio's own doors, not the customer's.

## Layout

```
app/
  actions/            server actions: auth, projects, tickets, workflows,
                      teams, clients, people, requests, chat, files
  (app)/              studio UI (sidebar + sections)
    projects/[id]/    overview, board, tickets, chat, approvals, docs, files,
                      budget, settings
    tickets/[id]/     ticket detail
    workflows/[id]/   status and transition builder
    docs/             studio and project documents
    timesheet/        weekly time grid
    reports/          period reports and money
    settings/         studio-wide defaults
    tokens/           API tokens, issued per person
  portal/             client portal
  intake/             public request form
  api/files/[id]/     attachment delivery with permission checks
  api/v1/             JSON API for agents and scripts
  api/git/webhook/    incoming branch and pull-request events
components/           ui primitives and feature modules (project, ticket, team, …)
lib/                  db, auth, session, permissions, workflow, budget, storage,
                      labels, portal, settings, rocketchat, notify, time,
                      reports, auth-tokens, rate-limit, timesheet, approvals,
                      docs, workflow-rules, workflow-hooks, ticket-ops,
                      ticket-prompt, git-events, api-tokens, api-rate-limit,
                      api-response, api-serialise, api-tickets
mcp/                  MCP server wrapping the API for coding agents
prisma/               schema.prisma, migrations/, seed.ts
tests/                vitest suite + fixtures (tests/setup)
```

## Scripts

| Command                       | What it does                                           |
| ----------------------------- | ------------------------------------------------------ |
| `npm run dev`                 | dev server                                             |
| `npm run build` / `npm start` | production build and start                             |
| `npm test` / `test:watch`     | the test suite                                         |
| `npm run audit`               | promises the interface makes that the server keeps     |
| `npm run db:up` / `db:down`   | Postgres in Docker                                     |
| `npm run db:migrate`          | create + apply a migration after a schema change       |
| `npm run db:deploy`           | apply pending migrations (what production runs)        |
| `npm run db:push`             | push the schema without a migration — prototyping only |
| `npm run db:seed`             | demo data (**wipes the database**)                     |
| `npm run db:studio`           | Prisma Studio                                          |

## Migrations

The schema is under migration control in `prisma/migrations`. Change
`schema.prisma`, then:

```bash
npm run db:migrate -- --name what_you_changed
```

Deployments run `npm run db:deploy`, which applies pending migrations without
prompting and never resets data. `db:push` remains available for throwaway
experiments, but anything that reaches a real database should go through a
migration — that is the only way to evolve a schema that already holds data.

Adopting migrations on a database that already exists (as this project did) is:

```bash
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql
npx prisma migrate resolve --applied 0_init
```

## The audit

```bash
npm run audit
```

Three checks for things the interface claims that the server does not do. They exist
because of a real one: the project settings page carried a **Workflow** dropdown that
changed, saved, said "Saved", and did nothing, because `updateProjectAction` had never
read that field. Neither half was wrong. The form submitted `workflowId` correctly and
the action correctly ignored it — switching a workflow moves every ticket on the project,
so it belongs to its own control, not to Save on a form about names and dates. What was
missing was the promise between them, and nothing in a type or a test can see that.

- **A form field no action reads.** Fields are attributed to the individual `<form>` they
  sit in, per component — a file often holds three forms, and a field belonging to one is
  not a finding against the others. Disabled controls are skipped, since they are never
  submitted. A field behind a guard like `{showWorkflow ? … }` is resolved **at each call
  site**: this matters more than it sounds, because the fix for the original bug was
  exactly such a guard, and a rule that waved through every conditional would stop seeing
  the bug the moment somebody dropped the guard again.
- **A switch nothing consults.** Every boolean in the schema must be read somewhere that
  is not the form offering it or the action storing it. On the portal flags this is not
  cosmetic: each one decides what a customer is shown.
- **A link with no route behind it**, resolved through dynamic segments and route groups.

It runs in CI after the typecheck. It is deliberately structural and reads the source
rather than the running app, so it costs a second and can run before every release.

Each check was proved by breaking something on purpose and watching it fail — including
putting the original workflow bug back, which it catches and nothing else.

## Tests

```bash
npm test
```

Vitest against a **real Postgres** — `studio_tracker_test` on the same container,
configured by `.env.test`. The suite refuses to run if `DATABASE_URL` doesn't point at
that database, and the global setup applies migrations with the same `migrate deploy`
production uses, so a broken migration history fails the tests.

These functions are mostly queries, so mocking Prisma would only test the mock. Coverage
is deliberately aimed at the logic where a silent bug is expensive rather than at
line count:

| Area                                | Why it's tested                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `projectScope` / `canAccessProject` | a mistake here shows one client another client's work                              |
| Project crews                       | a teammate of someone on the crew gets nothing; deleting a team changes nothing    |
| Portal settings                     | uploads must stay off when the files section is off                                |
| Workflow transitions                | permissive-when-empty, explicit moves, "from any status", specific-beats-catch-all |
| Transition rules                    | parsing junk safely, condition order, webhook URL rejection                        |
| Attachment kinds                    | what previews, SVG staying a file, size and extension formatting                   |
| Budget thresholds                   | announced once per mark; re-armed when the budget is raised                        |
| Timesheet cells                     | a day with several entries must never be collapsed into one                        |
| Approval decisions                  | who may decide, and when                                                           |
| Sign-in rate limiting               | lockout threshold, window rollover, per-email vs per-IP                            |
| Invite / reset tokens               | single use, expiry, disabled accounts, reissue voids the old                       |
| Period reports                      | month/quarter boundaries, CSV escaping, fixed-price has no amount                  |
| Doc visibility                      | internal docs stay internal; sharing needs the portal switch too                   |

The suite is mutation-checked: breaking `projectScope` so clients see everything makes
four tests fail, so the coverage isn't vacuous.

## Before going to production

Most of this is now done — see `DEPLOY.md`. What the server checks for you at boot:
`AUTH_SECRET` (refuses to start with the example value once `APP_URL` points at a real
host), `DATABASE_URL`, and warnings for plain http and missing mail. What is left:

- Move uploads to S3/MinIO if you plan to run more than one instance.
- Swap chat polling for WebSockets or SSE.
- Add email notifications alongside Rocket.Chat, for people who don't live in chat.
- Move webhook delivery into a queue with retries — right now a send is a single
  best-effort POST, and a Rocket.Chat outage simply drops that notification.


