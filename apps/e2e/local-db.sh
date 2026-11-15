#!/usr/bin/env bash
# Starts a throwaway PostgreSQL on port 5433 for local e2e runs when Docker is not available.
# CI uses a PostgreSQL service container instead. Requires PostgreSQL server binaries and, when run as root, the `postgres` OS user.
set -euo pipefail
BIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DIR=${PGDATA_DIR:-/tmp/factory-e2e-pg}
PORT=${PGPORT:-5433}
rm -rf "$DIR"; mkdir -p "$DIR"; chown postgres "$DIR" 2>/dev/null || true
RUN() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
RUN "$BIN/initdb -D $DIR -U postgres --auth=trust >/dev/null"
RUN "$BIN/pg_ctl -D $DIR -o '-p $PORT -k /tmp' -w start >/dev/null"
echo "PostgreSQL listening on 127.0.0.1:$PORT (user postgres, no password)"
