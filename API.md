# API

A small JSON API so a coding agent can pick up a ticket, read what it needs,
report back and log its time without a person relaying anything.

Everything lives under `/api/v1`. There is an MCP server in `mcp/` that wraps
these endpoints for Claude Code and anything else that speaks MCP.

## Tokens

Create one at **/tokens** (user menu → API tokens). It is shown once and stored
as a SHA-256 hash, exactly like the invite links.

A token is **not an identity of its own**: it acts as the person who created it
and inherits their project scope. An agent can never read a project its owner
cannot open, and a `MEMBER` token stays a member. Client-portal accounts cannot
issue usable tokens at all.

| Choice | Effect |
|---|---|
| Kind: **agent** | hours logged through it are recorded as agent work and comments are signed with the token name |
| Kind: **personal** | you, from a script; hours count as yours |
| Scope: **read** | every `GET` |
| Scope: **read + write** | also move tickets, comment, log time |
| Expiry | optional; an expired token answers 401 |

Revoking is immediate. Every issue and revoke lands in the activity log.

```
Authorization: Bearer stk_…
```

## Errors

```json
{ "error": "transition_refused", "message": "This transition is limited to: ADMIN, MANAGER" }
```

`error` is stable and machine-readable; `message` is the same sentence a person
sees in the UI. Statuses: `401` bad token, `403` read-only token on a write,
`404` outside your scope (never "exists but forbidden" — the two are
indistinguishable on purpose), `422` the request was understood and refused,
`400` malformed, `429` too fast, `500` our fault — the detail goes to the server
log, not into the response, because an internal message carries query shapes and
column names.

## Rate limits

Per token, per minute: **120 requests**, of which at most **40 may write**. Over
the line the answer is `429` with a `Retry-After` header; wait rather than spin.

The counter lives in the tracker's memory. That is right for the single instance
a studio runs and wrong behind a load balancer, so it is stated rather than
implied: if you run several, put a limiter in the proxy as well.

## Endpoints

### `GET /api/v1/me`

Who the token acts as, what it may do, and every project it can see. Call it
first.

```json
{
  "actingAs": { "name": "Arthur Levine", "email": "dev@studio.com", "role": "MEMBER" },
  "token": { "name": "Claude Code", "kind": "AGENT", "scopes": ["READ", "WRITE"] },
  "projects": [{ "key": "ACME", "name": "Acme online store", "status": "ACTIVE" }]
}
```

### `GET /api/v1/tickets`

| Query | Values |
|---|---|
| `project` | project key, e.g. `ACME` |
| `assignee` | `me`, `none`, or an email |
| `status` | `open`, `done`, or a status name |
| `q` | text in the title or description |
| `limit` | default 25, max 100 |

### `GET /api/v1/tickets/{KEY}`

`KEY` is the human key: `ACME-14`. Returns the ticket, its **acceptance criteria**,
its comments, its time entries, and **the transitions that are legal from its
current status**, each with the conditions it carries:

```json
"availableTransitions": [
  { "to": "Code review", "name": "Send to review", "requires": ["an estimate", "a description"] },
  { "to": "Done", "name": "Release", "requires": ["admin/manager"] }
]
```

An agent that can read the rules doesn't have to guess a move and then fail.

### `POST /api/v1/tickets/{KEY}/transition`

```json
{ "to": "Code review" }
```

Named, not identified: say where the work is, don't look up an id. The move
goes through the same code the board uses, so the workflow's conditions and
hooks apply. A refusal is `422` with the reason.

### `POST /api/v1/tickets/{KEY}/comments`

```json
{ "body": "Fix pushed to acme-4-address-state, PR #128." }
```

Comments from an agent token are signed `— via <token name>`, so the thread is
honest about what wrote them.

### `POST /api/v1/tickets/{KEY}/worklog`

```json
{ "hours": 1.5, "note": "Reproduced, fixed, tests added", "spentOn": "2026-08-04" }
```

Time written through an agent token is stored with `source: AGENT`. The studio
bills these hours to a client, so the record says plainly who did the work.
Whether anyone is **shown** that split is a separate decision: a studio switch
for the budget page, the reports and the CSV, and a per-project portal switch
for the client. Neither of them changes what is recorded.

### `GET /api/v1/projects/{KEY}/context`

Markdown, not JSON: brief, budget, crew, the workflow in order, every project
document and the open tickets. This is what an agent should read before writing
code. Add `?format=json` to get it wrapped in an object.

## MCP

```bash
claude mcp add studio-tracker \
  --env STUDIO_URL=http://localhost:3210 \
  --env STUDIO_TOKEN=stk_… \
  -- node ./mcp/studio-tracker.mjs
```

Tools: `whoami`, `list_tickets`, `get_ticket`, `project_context`,
`move_ticket`, `comment_ticket`, `log_time`.

`mcp/studio-tracker.mjs` has no dependencies and is about 250 lines, most of
them the tool descriptions — a studio should be able to read it end to end
before handing it a write token.

## What it deliberately does not do

- **No ticket creation.** Deciding that a piece of work exists is a
  conversation with a client, not an agent's call.
- **No project, client or user management.** Those are studio decisions.
- **No token minting for somebody else.** An agent's reach is always the reach
  of a named person who granted it.

## Git events (inbound)

`POST /api/git/webhook` — the forge tells the tracker what happened. Switched on
at **/settings → Git**, which also generates the shared secret and shows it once.

| Forge | Configure | Signature |
|---|---|---|
| GitHub | webhook, JSON, events `push` and `pull_request` | `X-Hub-Signature-256`, HMAC-SHA256 of the raw body |
| GitLab | push and merge request events | the secret in the token field |

A branch, a pull-request title or a commit message that names a ticket
(`ACME-14`, `acme-14-fix-address`) leaves a comment on that ticket with the
link. Studio settings can map two moments to a status **name**: when a pull
request opens, and when it merges. The name is looked up in each project's own
workflow, so a project whose workflow has no such status still gets the comment
and stays where it is.

**The event acts as the person who pushed.** They are matched by commit email,
or by the git username on their profile in People — GitHub's pull-request
payloads carry a login and no email, so without that field a PR cannot be
attributed. The consequence is the point of the whole thing: the workflow's
conditions apply to a merge exactly as they apply to a click. If releasing is
limited to admins, a developer merging their own pull request gets a comment on
the ticket, no transition, and a line in the activity log saying why.

When nobody matches, the tracker comments (attributed to the project manager,
naming the pusher in the text) and moves nothing. A stranger's push is news,
not authority.

A delivery is processed once. Both forges send an id (GitHub `X-GitHub-Delivery`,
GitLab `X-Gitlab-Event-UUID`); it is remembered for a week, so a captured payload
replayed later is answered with `handled: false` instead of a second comment and a
second transition. If a proxy strips the header, the hash of the body stands in.

Ticket-key matching is deliberately permissive — a project key is whatever the
studio typed, so `release-2024` reads as a key too. Nothing comes of it: the
lookup finds no such project and the event is dropped.

Every ticket page shows the branch name to use (`acme-14-delivery-address…`),
one click to copy as a `git checkout -b` command, so the key survives into git
and comes back.
