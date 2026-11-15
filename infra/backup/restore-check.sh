#!/bin/sh
# Proves a backup can be restored: verifies its checksum, restores it into a throwaway database and compares row counts
# of every table with the source database. Exits non-zero on any difference.
#   usage: restore-check.sh <dump file>
#   env:   DATABASE_URL (source, used for the comparison and to reach the server), BACKUP_VERIFY_STRICT=false to skip the comparison
set -eu

FILE="${1:?usage: restore-check.sh <dump file>}"
: "${DATABASE_URL:?DATABASE_URL is required}"
SCRATCH="restore_check_$(date -u +%Y%m%d%H%M%S)_$$"

# Same server and credentials, different database name.
SCRATCH_URL="$(printf '%s' "$DATABASE_URL" | sed -E "s#/[^/?]+(\\?.*)?\$#/$SCRATCH\\1#")"
ADMIN_URL="$DATABASE_URL"

( cd "$(dirname "$FILE")" && sha256sum -c "$(basename "$FILE").sha256" > /dev/null )

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$SCRATCH\""
cleanup() { psql "$ADMIN_URL" -q -c "DROP DATABASE IF EXISTS \"$SCRATCH\"" > /dev/null 2>&1 || true; }
trap cleanup EXIT

pg_restore --no-owner --no-privileges --exit-on-error --dbname="$SCRATCH_URL" "$FILE"

# Exact row counts per table, as "schema.table count" lines.
counts() {
  psql "$1" -At -v ON_ERROR_STOP=1 -c "SELECT format('SELECT %L, count(*) FROM %I.%I', schemaname||'.'||tablename, schemaname, tablename) FROM pg_tables WHERE schemaname='public' ORDER BY 1" \
    | while IFS= read -r q; do psql "$1" -At -F ' ' -c "$q"; done
}

RESTORED="$(counts "$SCRATCH_URL")"
TABLES="$(printf '%s\n' "$RESTORED" | grep -c . || true)"
[ "$TABLES" -gt 0 ] || { echo "restore check FAILED: no tables restored" >&2; exit 1; }

if [ "${BACKUP_VERIFY_STRICT:-true}" = "true" ]; then
  SOURCE="$(counts "$DATABASE_URL")"
  if [ "$SOURCE" != "$RESTORED" ]; then
    echo "restore check FAILED: row counts differ" >&2
    printf 'source:\n%s\nrestored:\n%s\n' "$SOURCE" "$RESTORED" >&2
    exit 1
  fi
fi
echo "restore check ok: $TABLES tables restored from $(basename "$FILE")"
