#!/usr/bin/env bash
# Prueba de punta a punta del instalador en una carpeta vacía (producto nuevo), con Docker o con PostgreSQL local.
# Verifica lo que el dueño vería: kit copiado, .env con secretos al azar, dependencias, base de datos migrada.
set -euo pipefail
mode="${1:?uso: bootstrap-e2e.sh <docker|local>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
target="$tmp/mi producto"   # con espacio a propósito

cleanup() {
  if [ "$mode" = docker ] && [ -d "$target" ]; then
    (cd "$target" && docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml down -v >/dev/null 2>&1) || true
  fi
  rm -rf "$tmp"
}
trap cleanup EXIT

args=(--target "$target" --db "$mode" --name "Mi Producto")
[ "$mode" = local ] && args+=(--database-url "postgres://factory:factory@localhost:5432/mi_producto")

echo "== instalador ($mode)"
(cd "$root" && pnpm --silent run bootstrap -- "${args[@]}")

cd "$target"
echo "== verificaciones"
test -f .factory-kit.json && grep -q '"complete": true' .factory-kit.json
grep -q 'validation: pending' product.config.yaml
test "$(stat -c '%a' .env)" = 600
! grep -qE 'AUTH_SECRET=(|placeholder|changeme)$' .env
git check-ignore -q .env
test ! -e docs/specs/instalador.md   # las especificaciones de la fábrica no viajan al producto

if [ "$mode" = docker ]; then
  tables=$(docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml exec -T db psql -U factory -d factory -Atc "select count(*) from information_schema.tables where table_schema='public'")
else
  tables=$(PGPASSWORD=factory psql -h localhost -U factory -d mi_producto -Atc "select count(*) from information_schema.tables where table_schema='public'")
fi
echo "tablas migradas: $tables"
[ "$tables" -gt 5 ]

echo "== repetir no rompe nada"
if (cd "$root" && pnpm --silent run bootstrap -- "${args[@]}"); then echo "✘ aceptó instalar dos veces"; exit 1; fi
(cd "$root" && pnpm --silent run bootstrap -- "${args[@]}" --force)

echo "✓ instalador en modo $mode: producto nuevo listo"
