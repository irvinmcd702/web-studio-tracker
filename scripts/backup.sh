#!/bin/sh
#
# One backup: the database and the uploaded files, taken as a pair.
#
# Two things here are deliberate and easy to get wrong.
#
# **Order.** The database is dumped first and the files are archived second. A
# file uploaded between the two ends up in the archive with no row pointing at
# it, which is a harmless orphan. The other order produces a row pointing at a
# file that is not in the backup — a broken attachment nobody notices until
# they click it.
#
# **Verification.** A dump that failed halfway is worse than no dump, because
# it looks like one. Every archive is read back with `pg_restore --list` before
# the run is called a success, so a truncated or corrupt file fails loudly on
# the night it happens rather than on the day it is needed.
#
# Run by hand at any time:
#   docker compose run --rm backup /usr/local/bin/backup.sh

set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
UPLOAD_DIR="${UPLOAD_SOURCE:-/uploads}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
DEST="$BACKUP_DIR/$STAMP"
PARTIAL="$BACKUP_DIR/.partial-$STAMP"

say() { echo "[backup $STAMP] $*"; }

# Built in a hidden directory and moved into place at the very end, so a run
# that dies half way never leaves something that looks like a usable backup.
mkdir -p "$PARTIAL"
trap 'rm -rf "$PARTIAL"' EXIT

# --- 1. The database ---------------------------------------------------------

say "dumping ${POSTGRES_DB:-studio_tracker}"
pg_dump \
  --host "${POSTGRES_HOST:-postgres}" \
  --port "${POSTGRES_PORT:-5432}" \
  --username "${POSTGRES_USER:-tracker}" \
  --dbname "${POSTGRES_DB:-studio_tracker}" \
  --format=custom \
  --file "$PARTIAL/database.dump"

# Reading the table of contents back proves the archive is complete and
# readable, which is the only claim a backup makes.
if ! pg_restore --list "$PARTIAL/database.dump" > /dev/null 2>&1; then
  say "FAILED: the dump could not be read back"
  exit 1
fi

TABLES="$(pg_restore --list "$PARTIAL/database.dump" | grep -c 'TABLE DATA' || true)"
if [ "$TABLES" -lt 10 ]; then
  # This schema has thirty-odd tables. A dump with almost none in it points at
  # the wrong database or an empty one, and should not quietly replace
  # yesterday's good copy in the rotation.
  say "FAILED: only $TABLES tables with data — refusing to keep this"
  exit 1
fi

# --- 2. The files ------------------------------------------------------------

if [ -d "$UPLOAD_DIR" ]; then
  say "archiving uploads"
  tar -czf "$PARTIAL/uploads.tar.gz" -C "$UPLOAD_DIR" .
  gzip -t "$PARTIAL/uploads.tar.gz"
else
  say "no upload directory at $UPLOAD_DIR — database only"
fi

# --- 3. What this backup is --------------------------------------------------

{
  echo "taken:    $STAMP"
  echo "database: ${POSTGRES_DB:-studio_tracker} on ${POSTGRES_HOST:-postgres}:${POSTGRES_PORT:-5432}"
  echo "tables:   $TABLES with data"
  echo "restore:  see DEPLOY.md — pg_restore --clean --if-exists"
} > "$PARTIAL/README.txt"

mv "$PARTIAL" "$DEST"
trap - EXIT

SIZE="$(du -sh "$DEST" | cut -f1)"
say "kept $DEST ($SIZE, $TABLES tables)"

# --- 4. Rotation -------------------------------------------------------------

if [ "$KEEP_DAYS" -gt 0 ]; then
  REMOVED=0
  for old in "$BACKUP_DIR"/*Z; do
    [ -d "$old" ] || continue
    if [ -n "$(find "$old" -maxdepth 0 -mtime "+$KEEP_DAYS" 2>/dev/null)" ]; then
      rm -rf "$old"
      REMOVED=$((REMOVED + 1))
    fi
  done
  [ "$REMOVED" -gt 0 ] && say "removed $REMOVED backup(s) older than $KEEP_DAYS days"
fi

# Anything left behind by a run that was killed rather than failing cleanly.
rm -rf "$BACKUP_DIR"/.partial-* 2>/dev/null || true

exit 0
