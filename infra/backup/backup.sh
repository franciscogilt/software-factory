#!/bin/sh
# Daily PostgreSQL backup: dump, check the dump can be read, checksum, optional off-site copy, prune old files.
# Settings come only from environment variables:
#   DATABASE_URL (required), BACKUP_DIR (default /backups), BACKUP_RETENTION_DAYS (default 14),
#   BACKUP_S3_URI (optional, e.g. s3://bucket/path; uses the aws CLI and any S3-compatible endpoint via AWS_ENDPOINT_URL)
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
DIR="${BACKUP_DIR:-/backups}"
KEEP_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DIR/factory-$STAMP.dump"

mkdir -p "$DIR"
TMP="$FILE.partial"
trap 'rm -f "$TMP"' EXIT

pg_dump --format=custom --no-owner --no-privileges --file="$TMP" "$DATABASE_URL"
# A dump that cannot be listed is not a backup.
pg_restore --list "$TMP" > /dev/null
mv "$TMP" "$FILE"
( cd "$DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )

if [ -n "${BACKUP_S3_URI:-}" ]; then
  aws s3 cp "$FILE" "$BACKUP_S3_URI/$(basename "$FILE")" --only-show-errors
  aws s3 cp "$FILE.sha256" "$BACKUP_S3_URI/$(basename "$FILE").sha256" --only-show-errors
fi

# Keep recent files; never delete the newest one.
find "$DIR" -name 'factory-*.dump*' -mtime "+$KEEP_DAYS" ! -name "$(basename "$FILE")*" -delete

date -u +%s > "$DIR/last_success"
echo "backup ok: $FILE ($(wc -c < "$FILE") bytes)"
echo "$FILE" > "$DIR/latest"
