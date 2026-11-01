# Backlog

Work that is understood but not done. Each entry says what it is, what it
would touch, and why it is waiting — so that picking it up starts from the
investigation rather than repeating it.

Things merely wished for do not belong here. This is for work that has been
looked at closely enough to cost.

Where an entry cites a number, it was measured against this repository while
the entry was written. Where it carries something over from the external
audit without re-checking, it says so.

## Prisma 7

Dependabot has an open pull request for `prisma` and `@prisma/client`
6.19 → 7.9. It fails, and correctly: Prisma 7 will not read a connection URL
out of the schema at all.

```
P1012: The datasource property `url` is no longer supported in schema files.
Move connection URLs for Migrate to `prisma.config.ts` and pass either
`adapter` for a direct database connection or `accelerateUrl` for Accelerate
to the PrismaClient constructor.
```

That is not a version bump behind a version number. It changes how every
query in the application is executed, and it touches eight places:

| Where | What changes |
| --- | --- |
| `prisma/schema.prisma` | `url` comes out of the datasource block |
| `prisma.config.ts` | new file: the URL for Migrate, and the seed command |
| `lib/db.ts` | `PrismaClient` takes an adapter |
| `tests/setup/db.ts`, `prisma/seed.ts` | two more constructors, same change |
| `package.json` | the `prisma.seed` block is not read in 7 |
| dependencies | `@prisma/adapter-pg`, `pg`, `@types/pg` |
| `Dockerfile` | the migrator stage copies `prisma/` only, so the new config never reaches it |
| CI and the end-to-end setup | both shell out to `prisma migrate deploy` |

Coverage for it is good — 437 tests against a real Postgres, and the browser
suite on top — so this is a job with a clear finish line rather than a risky
one. It is waiting because it deserves its own pass and its own verification,
not a place at the end of a batch of dependency bumps, and because it changes
the images the deploy workflow publishes.

Until it is done, that pull request will keep failing on every rebase. The
failure is expected and is not a signal about anything else.

## The ticket page sometimes keeps showing the old status

Twice, with clean evidence, a workflow transition on a ticket succeeded — the
action returned 200 and the row changed in the database — while the page went
on offering the transition that had just been spent. No refresh request was
made at all. A reload always showed the right thing.

It does not reproduce on demand: deliberate attempts to trigger it since have
all behaved correctly, including with the same timing. So it is recorded here
as intermittent rather than diagnosed, which is the honest description.

`StatusActions` calls `router.refresh()` when the action reports success and
`moveTicketAction` calls `revalidatePath`, so both halves of the mechanism are
present; whatever goes wrong is in whether the client applies the result.

The end-to-end tests reload before asserting, which keeps them honest about
what they cover — that the work reaches the database and comes back on the
next read — and means they will not catch a regression in the live refresh.
Whoever picks this up should start by finding a reliable reproduction; without
one there is nothing to verify a fix against.

## Backups are not off-site, and nobody is told when one fails

`scripts/backup.sh` is careful about the things that usually go wrong: the
database is dumped before the files, every dump is read back with
`pg_restore --list`, a dump with fewer than ten populated tables is refused
rather than allowed into the rotation, and both failures exit non-zero
leaving yesterday's copy alone. What happens next is the gap.

- **Same disk.** The copies sit on the machine they protect. That survives
  somebody deleting a project and does not survive losing the server.
  DEPLOY.md says so plainly under "This is not yet off-site" and gives the
  one command; nothing runs it.
- **A failure is a line in a log.** `say()` writes to stdout and the cron
  entry redirects to PID 1. A failed run exits non-zero into crond, which
  tells nobody. The first anybody learns of a fortnight of failed backups is
  the day they need one.
- **Never restored.** The dump is verified as a readable archive, which is
  not the same claim as "this restores into a database the application can
  run against". Until a restore has been done end to end, the backup is
  untested.

The three are one job: a destination, something that shouts when a run
fails, and a drill that proves the result. The first two are small. The
drill is the one worth designing, because the useful version runs on a
schedule against a throwaway database rather than being remembered once.

## Nothing collects errors from the running application

There are six `console.error` calls in `lib` and `app`, and that is the
whole of it. No Sentry, no equivalent, nothing that aggregates.

`/api/health` is well built — it runs `SELECT 1` rather than answering from
memory, and returns 503 when the database is unreachable, so a container
orchestrator will act on it. But the health check is the only signal that
exists, and it only covers the database. Nothing watches:

- the daily cron (`app/api/cron/daily`) — a digest that silently stops
  sending looks identical to a quiet week;
- SMTP — `sendMail` returns its failure to the caller and logs a redacted
  line, which is right for the user flow and invisible to anybody operating
  the server;
- git webhook processing;
- unhandled server-action errors, which currently reach a log nobody reads.

An exception in production is presently discovered by a person noticing
something missing. That is the actual gap — not the absence of a particular
vendor.

## No lint gate

There is no ESLint configuration in the repository at all — no
`.eslintrc*`, no `eslint.config.*`, and neither `eslint` nor
`eslint-config-next` in the dependencies. `npm run lint` is `next lint`,
which with no config drops into an interactive setup prompt, so it cannot
run in CI even in principle.

Worth knowing before starting: `next lint` is deprecated and removed in
Next 16, so the fix is to adopt the ESLint CLI directly rather than to
configure the thing that is going away.

## No security headers from the application

`next.config.ts` sets no `headers()`. Content-Security-Policy,
Strict-Transport-Security, Referrer-Policy and Permissions-Policy are
absent for every page.

The file route does better than the pages: `app/api/files/[id]/route.ts`
serves attachments under `sandbox; default-src 'none'`, with `nosniff`, and
hands SVG and HTML over as downloads rather than rendering them in this
origin. So the sharpest edge is already covered, and the rest of the
application is running on defaults.

A CSP for an application this size is not a one-line change — Next injects
inline scripts, and a policy strict enough to be worth having needs nonces
threaded through. HSTS and Referrer-Policy are a one-line change and worth
doing first.

## Lists load in full

Of the thirteen list pages, only the dashboard and the timesheet bound
anything with `take:`. The other eleven — projects, people, clients, teams,
docs, requests, reports, templates, tokens, workflows, my tasks — read
every matching row on every load.

For a studio of a dozen people this is the right trade and the code is
simpler for it. It stops being right somewhere in the low thousands of
tickets or the first year of activity rows, and the failure mode is a page
that gets slower until somebody exports to a spreadsheet instead — which is
the exact thing this product exists to stop.

## Mobile: touch targets and navigation

Measured at 390px wide rather than taken from the audit: on `/dashboard`
18 of 43 interactive elements are under 44×44, on `/projects` 23 of 51, on
a project overview 31 of 53. The navigation items are 34px high and the
brand link 28px. Nothing is unusable; one-handed use is worse than it needs
to be and mis-taps are more likely.

The navigation is the second half of the same problem. An administrator's
items become one horizontally scrolling strip with no indication that it
scrolls, and the mobile header carries no visible trigger for the command
palette — the keyboard shortcut is there and useless on a phone.

Also recorded from the audit and not re-measured: on the client portal at
phone width, the approval a client is being asked for sits below the task,
hours and budget cards, so the one thing being asked of them is the one
thing they have to scroll to find.

## The interface is English only

`lib/help-content.ts` carries a full Russian translation and picks it up
from `Accept-Language`. Everything else — every label, every button, every
error — is English, and there is no i18n framework in the dependencies.

This is only a gap if Russian-speaking users are in the audience. If they
are, the work is larger than translating strings: it is choosing a library,
threading a locale through server components and server actions, and
deciding what happens to data people have already typed. Worth a decision
before it is worth an estimate.

## Nothing measures whether the product works

The repository shows the tracker can do what it claims. It does not show
that the claim has been met in a real studio, and no number here would.

Worth capturing during a pilot: how often anybody still asks "what is the
status of X", how many spreadsheets are open beside it, how long a manager
spends assembling a report, how many clients open the portal at all, how
long an approval waits, and what share of hours are entered on the day they
were worked. Every one of those is measurable, and none of them is
measured.

This is a product task rather than an engineering one, which is why it sits
at the bottom — but it is the only entry here that could change what gets
built next.
