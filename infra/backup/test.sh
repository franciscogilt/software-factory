#!/bin/sh
# Self-test for the backup scripts against a real PostgreSQL (DATABASE_URL). Used by CI and runnable by hand.
# It must prove both that good backups pass and that bad ones are caught.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${DATABASE_URL:?DATABASE_URL is required}"
export BACKUP_DIR="$(mktemp -d)"
FAILS=0
check() { if [ "$1" = "$2" ]; then echo "ok   - $3"; else echo "FAIL - $3 (expected $2, got $1)"; FAILS=$((FAILS + 1)); fi; }

psql "$DATABASE_URL" -q -c 'CREATE TABLE IF NOT EXISTS backup_selftest (id int primary key, note text)' -c 'TRUNCATE backup_selftest' -c "INSERT INTO backup_selftest VALUES (1,'a'),(2,'b'),(3,'c')"

sh "$HERE/backup.sh" > /dev/null; check $? 0 "backup succeeds"
DUMP="$(cat "$BACKUP_DIR/latest")"
[ -f "$DUMP.sha256" ]; check $? 0 "checksum file written"
sh "$HERE/restore-check.sh" "$DUMP" > /dev/null; check $? 0 "restore check passes on a good backup"
sh "$HERE/healthcheck.sh"; check $? 0 "health check is healthy after a backup"

# 1. The data changed after the backup: counts differ, so the check must fail.
psql "$DATABASE_URL" -q -c "INSERT INTO backup_selftest VALUES (4,'d')"
sh "$HERE/restore-check.sh" "$DUMP" > /dev/null 2>&1; check $? 1 "restore check fails when row counts differ"
BACKUP_VERIFY_STRICT=false sh "$HERE/restore-check.sh" "$DUMP" > /dev/null 2>&1; check $? 0 "restore check passes when comparison is disabled"

# 2. A tampered file must fail its checksum.
cp "$DUMP" "$BACKUP_DIR/tampered.dump"; cp "$DUMP.sha256" "$BACKUP_DIR/tampered.dump.sha256"
sed -i "s/$(basename "$DUMP")/tampered.dump/" "$BACKUP_DIR/tampered.dump.sha256"
printf 'x' >> "$BACKUP_DIR/tampered.dump"
sh "$HERE/restore-check.sh" "$BACKUP_DIR/tampered.dump" > /dev/null 2>&1; check $? 1 "restore check fails on a tampered backup"

# 3. No throwaway databases left behind.
LEFT="$(psql "$DATABASE_URL" -Atc "SELECT count(*) FROM pg_database WHERE datname LIKE 'restore_check_%'")"
check "$LEFT" 0 "no scratch databases left behind"

# 4. Old backups are pruned, the newest is kept.
OLD="$(date -u -d "@$(( $(date -u +%s) - 2592000 ))" '+%Y-%m-%d %H:%M:%S')" # 30 days ago, portable (GNU and busybox)
touch "$BACKUP_DIR/factory-20000101T000000Z.dump" "$BACKUP_DIR/factory-20000101T000000Z.dump.sha256"
touch -d "$OLD" "$BACKUP_DIR/factory-20000101T000000Z.dump" "$BACKUP_DIR/factory-20000101T000000Z.dump.sha256"
sh "$HERE/backup.sh" > /dev/null
[ ! -e "$BACKUP_DIR/factory-20000101T000000Z.dump" ]; check $? 0 "old backups are pruned"
[ -e "$(cat "$BACKUP_DIR/latest")" ]; check $? 0 "newest backup is kept"

# 5. A stale last_success turns the health check red.
echo $(( $(date -u +%s) - 100000 )) > "$BACKUP_DIR/last_success"
sh "$HERE/healthcheck.sh"; check $? 1 "health check fails when the last backup is older than 26 hours"

# 6. An unreachable database makes the backup fail loudly and leaves no partial file.
BEFORE="$(ls "$BACKUP_DIR" | wc -l)"
DATABASE_URL="postgres://nobody@127.0.0.1:1/none" sh "$HERE/backup.sh" > /dev/null 2>&1; check $? 1 "backup fails when the database is unreachable"
check "$(ls "$BACKUP_DIR" | wc -l)" "$BEFORE" "failed backup leaves no partial file"

psql "$DATABASE_URL" -q -c 'DROP TABLE backup_selftest'
rm -rf "$BACKUP_DIR"
[ "$FAILS" -eq 0 ] && echo "backup self-test passed" || { echo "$FAILS check(s) failed"; exit 1; }
