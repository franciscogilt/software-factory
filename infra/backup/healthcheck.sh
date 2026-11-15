#!/bin/sh
# Healthy when the last successful backup is less than 26 hours old.
DIR="${BACKUP_DIR:-/backups}"
[ -f "$DIR/last_success" ] || exit 1
[ $(( $(date -u +%s) - $(cat "$DIR/last_success") )) -lt 93600 ]
