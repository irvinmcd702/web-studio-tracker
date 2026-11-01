# Running it for real

The tracker is one Next.js process, one Postgres, and a directory for
attachments. Nothing else is required.

## The short version

```bash
cp .env.example .env
# fill in: AUTH_SECRET, APP_URL, POSTGRES_PASSWORD, and the SMTP_* block
docker compose -f docker-compose.prod.yml up -d --build
```

That builds two images from one Dockerfile — a short-lived **migrator** and the
**runtime** — waits for Postgres to be healthy, applies the migrations, and only
then starts the server. If a migration fails the app never starts, which is the
point.

The runtime image carries the traced server bundle and nothing else: no source,
no package manager, no Prisma CLI, and it runs as an unprivileged user.

Verified rather than assumed: the image builds, the migrator applies all
migrations to an empty database, the container answers `/api/health`, serves
`/login`, and Docker reports it healthy.

The first person needs an account — see **First account** below.

## Deploying from GitHub

Two workflows. **CI** runs on every push and pull request: typecheck, the whole
suite against a real Postgres service, then a build. **Deploy** runs only after
CI succeeds on `main`, builds the runtime and migrator images, and publishes
them to this repository's own registry as
`ghcr.io/<owner>/<repo>:<commit>` and `:latest`.

The half that talks to a server is **skipped until you switch it on**, so
publishing an image works from day one and nothing tries to log in anywhere it
has no business.

### Switching the release half on

On the repository: a variable `DEPLOY_ENABLED=true`, and an environment called
`production` holding these secrets:

| Secret | What it is |
|---|---|
| `DEPLOY_HOST` | the server's address |
| `DEPLOY_USER` | the account to log in as |
| `DEPLOY_SSH_KEY` | its private key — give this key access to nothing else |
| `DEPLOY_PATH` | the directory holding `docker-compose.deploy.yml` and `.env` |
| `DEPLOY_PORT` | SSH port, if not 22 |
| `DEPLOY_PORT_HTTP` | the host port the app is bound to, if not 3000 |

On the server, once: install Docker, create that directory, put
`docker-compose.deploy.yml` and a filled-in `.env` in it (including
`IMAGE=ghcr.io/<owner>/<repo>`), and `docker login ghcr.io` with a token that
can read packages.

Then every merge to `main` pulls the new images, runs the migrations to
completion, replaces the app only if they succeeded, and **fails the deploy if
the new container does not answer `/api/health`**. A failed migration leaves the
old container serving.

Rolling back is the same file with an older `IMAGE_TAG`:

```bash
IMAGE_TAG=<older commit> docker compose -f docker-compose.deploy.yml up -d --wait
```

### Behind Cloudflare

The compose file binds the app to `127.0.0.1` on purpose: Cloudflare reaches it
through a tunnel or a reverse proxy on the same host, and nothing should be able
to reach the origin directly — that would be a way round the proxy, the WAF and
the rate limiting.

Set `APP_URL` to the **https** address people type, even though the container
only ever speaks http. Cloudflare terminates TLS; the app builds its links from
`APP_URL` and marks its session cookie `secure`, which is correct because the
browser's side of the conversation is https.

One thing to get right: the sign-in limiter counts per address, and behind a
proxy the app reads `CF-Connecting-IP` first. Cloudflare sets that header itself
and overwrites whatever the caller sent, so it cannot be forged. `X-Forwarded-For`
is only used as a last resort, because Cloudflare **appends** to it — its first
entry is a value the caller chose, and trusting it would let one attacker look
like a fresh address on every request.

## What the server insists on

`instrumentation.ts` checks the environment before the first request. The rule
is about reach, not about `NODE_ENV`:

| Situation | What happens |
|---|---|
| No `DATABASE_URL` or no `AUTH_SECRET` | refuses to start, always |
| `APP_URL` is a real host **and** `AUTH_SECRET` is the example value | refuses to start |
| Same, but `APP_URL` is missing or localhost | starts, warns loudly |
| Plain `http://` on a real host | starts, warns — session cookies travel in the clear |
| No SMTP | starts, warns — invites have to be handed over by hand |
| No `CRON_SECRET` | starts — the scheduled digest is simply not available |
| No `OPENROUTER_API_KEY` | starts — drafting cannot be switched on |

So trying the production build on your own machine never requires inventing
credentials, and an instance the world can reach cannot run on a secret that is
printed in this repository.

## Mail

Invites and password resets are emailed when SMTP is configured, and shown on
screen for a manager to pass on when it is not. Both paths are real; neither is
a stub.

```
SMTP_URL="smtp://user:password@mail.example.com:587"
MAIL_FROM="Studio Tracker <tracker@example.com>"
```

Or the parts separately (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD`). Port 465 is treated as implicit TLS, anything else upgrades
with STARTTLS.

With mail working, **/forgot-password** starts working too: people reset their
own passwords instead of asking an administrator. The page answers the same
sentence for every address, so it cannot be used to find out who has an account
here, and it counts attempts on the same limiter as sign-in.

Without mail the page says so plainly rather than pretending to send anything.

## The daily digest

The **Needs attention** panel on the dashboard needs no setup — it is computed
from the database each time the page is opened. The once-a-day summary does:

```
CRON_SECRET="…"            # openssl rand -base64 24
docker compose -f docker-compose.prod.yml --profile digest up -d
```

That adds a small busybox container running `crond`, which posts to
`/api/cron/daily` at `DIGEST_AT` (default `0 8 * * *`, server time). Anything
that can make an HTTP request does just as well:

```bash
curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://tracker.example.com/api/cron/daily
```

The same call also runs the **retention sweep** — before the digest, and whether
or not the digest is switched on. Set up the cron even if you never want a
mailing, or nothing ever ages out. The response reports both halves:

```json
{ "retention": { "loginAttempts": 3, "authTokens": 1, … },
  "digest":    { "ok": true, "signals": 4, "emailed": 2, … } }
```

Three deliberate choices:

- **The schedule lives outside the app.** An interval inside the server process
  is simpler right until a second instance starts and everyone gets two
  letters. A cron entry can be read, timed, disabled and run by hand.
- **POST, not GET.** It sends mail. A URL that mails the whole studio when
  something prefetches it is not a URL worth having.
- **It refuses to run twice within twelve hours** unless the body says
  `{"force": true}`, so a double-firing cron or a curl typed by hand costs
  nothing.

Without `CRON_SECRET` the endpoint answers `404` rather than existing
unprotected. What gets sent, and to whom, is set in **Studio settings →
Deadlines and reminders**; both channels are off until someone turns them on.

## Drafting with a model

Optional, and off three times over. Without `OPENROUTER_API_KEY` the buttons do
not exist; with it, the studio still has to switch drafting on; and each project
still has to allow its own material to be sent. Nothing changes by upgrading.

```
OPENROUTER_API_KEY="sk-or-…"
# Optional: any OpenAI-compatible endpoint — a proxy on your network, or a
# model on your own hardware.
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
```

What crosses the wire is the material being drafted from: the ticket text and
the project scope, the client thread including internal notes, or the enquiry as
it arrived. Hours, rates, money and contact details are not part of any of them.
Every call — successful or refused — is recorded with its tokens, its cost, who
asked and which project, and the totals are on the settings page.

The model only ever produces text on a screen. It does not write to a ticket,
move anything, decide an approval or touch an hour. Saving is a separate press
by a person.

## Files

Attachments are written to `UPLOAD_DIR` (`/app/uploads` in the container, a
named volume in compose). Back it up with the database — losing one without the
other leaves rows pointing at files that no longer exist.

Running more than one instance needs shared storage. There is no S3 driver yet;
until there is, run one instance or put the volume on shared storage.

## Health

`GET /api/health` pings the database and answers `200` with the round-trip time,
or `503` when Postgres is unreachable. The container's `HEALTHCHECK` uses it, so
a process that is up but cannot see its database is not reported as healthy.

## Migrations

The `migrate` service runs `prisma migrate deploy` and exits; the app waits for
it with `service_completed_successfully`.

It is a separate image on purpose. The Prisma CLI needs the whole
`node_modules` it was installed with, and copying pieces of that into a slim
runtime breaks on the next Prisma release — it broke on the first attempt here,
which is why the runtime no longer carries the CLI at all.

`migrate deploy` only applies migrations that already exist, so a deploy can
never invent one. It is the same command the test suite runs against a scratch
database, which is what keeps a broken migration from reaching production
quietly.

Running the image outside compose means running the migrator yourself:

```bash
docker build -t tracker-migrator --target migrator .
docker run --rm -e DATABASE_URL=… tracker-migrator
```

## First account

There is no public sign-up: the tracker is for one studio and its clients.
Set these before the first start, on an empty database:

```
BOOTSTRAP_ADMIN_EMAIL="you@studio.com"
BOOTSTRAP_ADMIN_NAME="Your Name"
```

The server creates that administrator and prints a one-time link to its log.
Open it, choose a password, then remove the two variables.

It is safe to leave in place but pointless: the bootstrap does nothing unless
the user table is **completely empty** — not "no administrators", no accounts at
all — so a tracker in use can never be reopened this way, whatever the variable
says. It never sets a password either; the account starts unusable and its
owner picks their own through the same one-time link every invite uses.

## Behind a proxy

Set `APP_URL` to the public address and make sure the proxy passes
`x-forwarded-for` — the sign-in limiter counts per address, and without the
header everyone shares one bucket.

## Backups

A `backup` container dumps the database and archives the uploads once a night,
into a `backups` volume. `BACKUP_AT` sets the schedule (default `0 3 * * *`,
server time) and `BACKUP_KEEP_DAYS` how many days are kept (default 14). It also
runs once the moment it starts, so a misconfigured backup is discovered on the
day it is set up rather than at three the following morning.

This exists because **Coolify's own backup feature does not cover this
database.** That feature backs up databases Coolify manages as their own
resource; ours is a service inside a compose deployment, so it is invisible to
it.

Three things it does on purpose, all in `scripts/backup.sh`:

- **The database is dumped before the files are archived.** A file uploaded
  between the two ends up in the archive with no row pointing at it, which is a
  harmless orphan. The other order gives you a row pointing at a file the backup
  does not contain — a broken attachment nobody notices until they click it.
- **Every dump is read back** with `pg_restore --list` before the run counts as
  a success. A dump that failed halfway is worse than no dump, because it looks
  like one.
- **A dump with almost nothing in it is refused.** Fewer than ten tables with
  data means the wrong database or an empty one, and it must not quietly take a
  good copy's place in the rotation. Both failures exit non-zero and leave
  yesterday's backup alone.

Run one by hand at any time:

```bash
docker compose -f docker-compose.coolify.yml run --rm backup /usr/local/bin/backup.sh
```

### This is not yet off-site

The copies sit on the same machine and the same disk as the thing they protect.
That guards against somebody deleting a project; it does not guard against
losing the server. Getting them off the box is one command and a destination
you choose:

```bash
docker run --rm -v <stack>_backups:/backups -v /tmp/out:/out alpine \
  cp -r /backups/. /out/
# then rsync / restic / borg / your host's snapshots to somewhere else
```

Until that runs somewhere on a schedule, treat the backup as protection against
mistakes rather than against disaster, and say so to anyone who asks.

### Restoring

Verified rather than assumed — a dump taken by this script was restored into a
scratch database and every table's row count matched the source.

```bash
# 1. Stop the app so nothing writes while you work.
docker compose -f docker-compose.coolify.yml stop app

# 2. Restore the database. --clean --if-exists drops what is there first, so
#    this is a replacement, not a merge.
docker compose -f docker-compose.coolify.yml run --rm backup \
  pg_restore --host postgres --username tracker --dbname studio_tracker \
             --clean --if-exists /backups/<timestamp>/database.dump

# 3. Restore the files.
docker run --rm -v <stack>_uploads:/uploads -v <stack>_backups:/backups alpine \
  sh -c 'rm -rf /uploads/* && tar -xzf /backups/<timestamp>/uploads.tar.gz -C /uploads'

# 4. Start it again.
docker compose -f docker-compose.coolify.yml start app
```

Each backup directory carries a `README.txt` saying when it was taken, from
which database, and how many tables had data in it.

**Do this once for real, on a scratch database, before you need it.** A backup
nobody has restored is a hope.

## Answering a data request

Before the first customer signs in, fill in **Studio settings → Who answers for
the data**: your legal name, an address that somebody reads, and your own
paragraphs about lawful basis. Until you do, the portal's privacy notice tells
customers outright that the studio has not named a controller — which is the
honest thing for it to say, and not what you want them reading.

That notice (`/portal/privacy`, linked from every portal page) states who
actually receives their data based on which integrations are switched on right
now, and the retention periods actually configured. It is generated, not typed,
so it cannot drift from the system. The internal counterpart —
[PRIVACY.md](PRIVACY.md) — lists every table, every processor and every measure,
and is the starting point for a record of processing.


Someone asks what you hold about them, or asks you to erase it. Both are in the
interface, so neither needs a database console:

- **Show me / give me a copy** — the person themselves: account menu →
  *Download my data*. On their behalf: the download icon on their row in
  **People**. JSON, machine-readable, no password or token secrets in it.
- **Erase me** — **People** → the shield icon, administrators only. Type their
  email to confirm. Personal data goes; logged hours, comments and files stay,
  attributed to a nameless account, because they are the client's billing
  record rather than the person's data.

**Retention** is at **Studio settings → How long things are kept**, for
administrators. Three periods you choose (activity feed, client chat, model
usage log) and three that are fixed because there is nothing to decide (sign-in
counters, spent one-time links, webhook ids). All three of the first kind start
at zero, meaning *keep forever* — that is a default, not a policy, and the
screen says so. Nothing sweeps projects, tickets, hours or files.

Sign-in counters store no IP addresses and no email addresses: the identifier is
HMAC'd with `AUTH_SECRET` before it is written. Nothing to erase, nothing to
disclose. Rotating that secret clears every lockout in progress.

Two things that remain manual, and there is no honest way around either:

- **Free text other people wrote.** A colleague's comment naming the person is
  that colleague's text in a project's record. Search for the name in the
  command palette and edit what comes up.
- **Backups.** A dump taken before the erasure still contains the earlier
  state. Whatever retention you apply to backups is the answer here, and it is
  not something the app can do for you.

Also: the client company row (`/clients`) carries a contact name, email and
phone for someone who may have no account at all. Those are ordinary editable
fields — clear them on the client's page.

## Still missing

Stated rather than implied:

- **Outgoing webhooks are best-effort.** A Rocket.Chat outage drops that one
  notification; there is no retry queue.
- **Chat polls every 15 seconds** instead of holding a socket open.
- **No email notifications** for assignments and comments — only Rocket.Chat.
- **API rate limiting is per process** (see `API.md`), so several instances need
  a limiter in the proxy too.
