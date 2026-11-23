#!/usr/bin/env bash
# Prueba de punta a punta del instalador en una carpeta vacía (producto nuevo), con Docker o con PostgreSQL local.
# Verifica lo que el dueño vería: kit copiado, .env con secretos al azar, dependencias, base de datos migrada.
# Pensado para el CI (máquina desechable); en tu máquina usa un nombre de proyecto propio y no toca otros productos.
set -euo pipefail
mode="${1:?uso: bootstrap-e2e.sh <docker|local>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
target="$tmp/mi producto"   # con espacio a propósito
project="e2e_instalador_$$"  # nombre de producto (y de proyecto Compose) que no choca con los tuyos
compose=(docker compose -p "$project" -f infra/docker-compose.yml -f infra/docker-compose.dev.yml)

fail() { echo "✘ $*"; exit 1; }
cleanup() {
  if [ "$mode" = docker ] && [ -d "$target" ]; then (cd "$target" && "${compose[@]}" down -v >/dev/null 2>&1) || true; fi
  if [ "$mode" = local ]; then PGPASSWORD=factory psql -h localhost -U factory -d postgres -qc "drop database if exists $project" >/dev/null 2>&1 || true; fi
  rm -rf "$tmp"
}
trap cleanup EXIT

args=(--target "$target" --db "$mode" --name "$project")
[ "$mode" = local ] && args+=(--database-url "postgres://factory:factory@localhost:5432/$project")
bootstrap() { (cd "$root" && pnpm --silent run bootstrap -- "${args[@]}" "$@"); }

count_tables() {
  local sql="select count(*) from information_schema.tables where table_schema='public'"
  if [ "$mode" = docker ]; then (cd "$target" && "${compose[@]}" exec -T db psql -U factory -d factory -Atc "$sql")
  else PGPASSWORD=factory psql -h localhost -U factory -d "$project" -Atc "$sql"; fi
}

verify() {
  # Explicit ifs: `set -e` does not stop on `!` or on the left side of `&&`.
  [ -f "$target/.factory-kit.json" ] || fail "falta el marcador de instalación"
  grep -q '"complete": true' "$target/.factory-kit.json" || fail "la instalación no quedó completa"
  grep -q 'validation: pending' "$target/product.config.yaml" || fail "product.config.yaml sin validation: pending"
  [ "$(stat -c '%a' "$target/.env")" = 600 ] || fail ".env no tiene permisos 600"
  secret=$(sed -n 's/^AUTH_SECRET=//p' "$target/.env")
  [ "${#secret}" -ge 40 ] || fail "AUTH_SECRET no es un secreto generado (longitud ${#secret})"
  grep -qF "$secret" "$root/.env.example" && fail "AUTH_SECRET es el valor de ejemplo"
  (cd "$target" && git check-ignore -q .env) || fail ".env no está ignorado por git"
  [ ! -e "$target/docs/specs/instalador.md" ] || fail "las especificaciones de la fábrica viajaron al producto"
  tables=$(count_tables)
  echo "tablas migradas: $tables"
  [ "$tables" -ge 10 ] || fail "base de datos sin migrar ($tables tablas)"
}

echo "== instalador ($mode)"
bootstrap
verify

echo "== una segunda instalación se rechaza (y por la razón correcta)"
if out=$(bootstrap 2>&1); then fail "aceptó instalar dos veces"; fi
grep -q -- '--force' <<<"$out" || fail "falló por otra razón: $out"

echo "== --force no rompe nada"
before=$(sed -n 's/^AUTH_SECRET=//p' "$target/.env")
bootstrap --force
[ "$(sed -n 's/^AUTH_SECRET=//p' "$target/.env")" = "$before" ] || fail "--force cambió los secretos"
verify

echo "✓ instalador en modo $mode: producto nuevo listo"
