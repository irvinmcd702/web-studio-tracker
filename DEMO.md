# Demo: an agent works a ticket

Five minutes, one terminal, one browser window. Everything below was run
against the seeded demo data and the output is verbatim.

Keep the tracker open on **ACME-4** while you run the commands: every step
lands on the page live.

## Setup

```bash
npm run setup && npm run dev     # tracker on http://localhost:3210
```

Sign in as `dev@studio.com` / `admin123`, open **API tokens** in the user menu,
create one named *Claude Code*, tick **Allow changes**, copy it.

```bash
export STUDIO_URL=http://localhost:3210
export T=stk_…            # the token you just copied
```

## 1. The agent finds out who it is

```bash
curl -s -H "Authorization: Bearer $T" $STUDIO_URL/api/v1/me
```

```json
{
  "actingAs": { "name": "Arthur Levine", "email": "dev@studio.com", "role": "MEMBER" },
  "token": { "name": "Claude Code", "kind": "AGENT", "scopes": ["READ", "WRITE"] },
  "projects": [
    { "key": "ACME", "name": "Acme online store", "status": "ACTIVE" },
    { "key": "TPROM", "name": "Technoprom landing page", "status": "ACTIVE" }
  ]
}
```

Two projects, not four. Arthur is not on the crew of the other two, so neither
is anything holding his token. **This is the point to make in a demo**: the
agent's reach is a person's reach.

## 2. It picks up its work

```bash
curl -s -H "Authorization: Bearer $T" \
  "$STUDIO_URL/api/v1/tickets?assignee=me&status=open"
```

```json
{ "count": 2, "tickets": [
  { "key": "ACME-4", "title": "Delivery address is lost on mobile",
    "type": "BUG", "priority": "URGENT", "status": "QA", … },
  { "key": "TPROM-4", "title": "Build the landing page", … } ] }
```

## 3. It reads the project before touching code

```bash
curl -s -H "Authorization: Bearer $T" $STUDIO_URL/api/v1/projects/ACME/context
```

Markdown, ready to paste into a system prompt: the brief, the budget, the crew
and their roles, the workflow in order, **every project document** (the spec,
the environments-and-access note) and the open tickets.

## 4. It reads the rules of the ticket

```bash
curl -s -H "Authorization: Bearer $T" $STUDIO_URL/api/v1/tickets/ACME-4
```

```json
"availableTransitions": [
  { "to": "Backlog",     "name": "Send back to backlog", "requires": [] },
  { "to": "Code review", "name": "← Code review",        "requires": [] },
  { "to": "Done",        "name": "Release",              "requires": ["admin/manager"] }
]
```

The agent can see that releasing is not its call.

## 5. It tries anyway, and the tracker says no

```bash
curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"to":"Done"}' $STUDIO_URL/api/v1/tickets/ACME-4/transition
```

```json
{ "error": "transition_refused", "message": "This transition is limited to: ADMIN, MANAGER" }
```

Same rule, same sentence a developer gets in the browser. The workflow is not
advisory just because the caller is a machine.

## 6. It does what it may

```bash
curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"to":"Code review"}' $STUDIO_URL/api/v1/tickets/ACME-4/transition
```

```json
{ "moved": true, "from": "QA", "to": "Code review", "ticket": { … } }
```

The card moves on the board in the open browser window.

## 7. It reports back and books its time

```bash
curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"body":"Reproduced on iOS Safari: the address form loses state when the keyboard closes. Fix pushed to acme-4-address-state, PR #128."}' \
  $STUDIO_URL/api/v1/tickets/ACME-4/comments

curl -s -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"hours":1.5,"note":"Reproduced, fixed, tests added"}' \
  $STUDIO_URL/api/v1/tickets/ACME-4/worklog
```

```json
{ "logged": true, "entry": { "hours": 1.5, "source": "AGENT", "person": "Arthur Levine" } }
```

On the ticket the comment is signed **— via Claude Code**, and the time entry
carries an **agent** badge. The studio bills these hours to a client, so the
record says who did the work.

## 8. A read-only token can only watch

```bash
curl -s -X POST -H "Authorization: Bearer $READ_ONLY" -H "Content-Type: application/json" \
  -d '{"to":"Backlog"}' $STUDIO_URL/api/v1/tickets/ACME-4/transition
```

```json
{ "error": "read_only", "message": "This token has the READ scope only. Issue a token with WRITE to change anything." }
```

## Without any of this: the copy button

Not every studio wants a token on every laptop. Open **ACME-4** in the browser
and press **Copy as prompt**: the ticket, its acceptance criteria, the URL of
the project context, the moves that are legal from here and how to report back,
as one block of markdown. Paste it into whatever the developer already uses.

The tracker never calls a model itself — there is no key to configure and
nothing leaves the server.

## Git, from the other side

Switch on **Settings → Git**, copy the generated secret into the repository's
webhook, and set "when a PR opens" to *Code review*, "when it merges" to *QA*.
Put the ticket key in the branch — the ticket page hands you the name.

Open a pull request from `acme-3-erp-stock`:

```json
{ "handled": true, "kind": "opened",
  "results": [{ "key": "ACME-3", "outcome": "commented; moved In development → Code review" }] }
```

Merge it:

```json
{ "results": [{ "key": "ACME-3", "outcome": "commented; moved Code review → QA" }] }
```

Now set "when it merges" to *Done*, which this workflow limits to admins and
managers, and let the developer merge again:

```json
{ "results": [{ "key": "ACME-3",
    "outcome": "commented; not moved: This transition is limited to: ADMIN, MANAGER" }] }
```

**That is the sentence to put on a slide.** The rule the studio wrote holds
whether the caller is a person clicking, an agent with a token, or a merge
button on GitHub.

## The same thing from Claude Code

```bash
claude mcp add studio-tracker \
  --env STUDIO_URL=$STUDIO_URL \
  --env STUDIO_TOKEN=$T \
  -- node ./mcp/studio-tracker.mjs
```

> **What am I assigned to on ACME, and what does the project expect of me?**

Claude calls `list_tickets`, then `project_context`, then `get_ticket`, and
answers with the brief, the conventions and the transitions it is allowed to
use. When it finishes a change it calls `comment_ticket` and `log_time`
itself.

## The awkward question, answered on purpose

A client asks how much of this was done by AI. The tracker already knows: every
hour booked through an agent token carries its source, and nothing can rewrite
that from the interface.

What the studio does with it is a choice, made twice and in the open:

- **Settings → Agent work** decides whether the split shows up internally, on
  the project budget, in the reports and as a *Done by* column in the CSV.
- **Project → Settings → Client portal → Agent hours, separately** decides
  whether the client is told. Off unless somebody turns it on.

Switching either off hides a breakdown. It does not change what was recorded,
and it does not change the invoice: the hour was worked, the split is
information, not a discount.

## The line to end on

Nothing here is a chat window bolted onto a tracker. The agent goes through the
same permission check, the same workflow conditions and the same activity log
as a person with a mouse, and every hour it books is marked as its own.
