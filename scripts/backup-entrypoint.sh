#!/bin/sh
#
# Installs the schedule and hands over to crond.
#
# The secret is passed by reference rather than written into the crontab, the
# same way the digest container does it: a crontab is a file on a disk, and a
# database password does not belong in one.

set -eu

SCHEDULE="${BACKUP_AT:-0 3 * * *}"

echo "$SCHEDULE /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root

echo "[backup] scheduled: $SCHEDULE"
echo "[backup] keeping $((${BACKUP_KEEP_DAYS:-14})) days in ${BACKUP_DIR:-/backups}"

# One immediately, so a misconfigured backup is discovered on the day it is set
# up rather than at three the following morning.
if [ "${BACKUP_ON_START:-true}" = "true" ]; then
  /usr/local/bin/backup.sh || echo "[backup] the first run failed — see above"
fi

exec crond -f -l 8
