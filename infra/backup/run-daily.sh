#!/bin/sh
# Runs a backup and a restore check once a day at BACKUP_HOUR_UTC (default 06 UTC), forever.
# A failure is logged loudly and the loop continues; the container health check turns red when the last
# successful backup is older than 26 hours.
set -u
HOUR="${BACKUP_HOUR_UTC:-06}"
DIR="${BACKUP_DIR:-/backups}"

while true; do
  NOW="$(date -u +%s)"
  TARGET="$(date -u -d "today $HOUR:00" +%s 2>/dev/null || date -u -d "$(date -u +%F) $HOUR:00:00" +%s)"
  [ "$TARGET" -le "$NOW" ] && TARGET=$((TARGET + 86400))
  if [ -z "${BACKUP_RUN_NOW:-}" ]; then sleep $((TARGET - NOW)); fi
  BACKUP_RUN_NOW=""
  if /app/backup.sh; then
    # Restore check only when strictness is wanted; the dump is already listed by backup.sh.
    if [ "${BACKUP_VERIFY:-true}" = "true" ]; then
      /app/restore-check.sh "$(cat "$DIR/latest")" || echo "BACKUP RESTORE CHECK FAILED" >&2
    fi
  else
    echo "BACKUP FAILED" >&2
  fi
  sleep 60
done
