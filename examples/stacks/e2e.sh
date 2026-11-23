#!/usr/bin/env bash
# Prueba de punta a punta de la fábrica en otro stack, como la haría el dueño:
# copia el proyecto de ejemplo, le instala la fábrica, corre la incorporación (con cobertura real) y las puertas.
set -euo pipefail
fixture="${1:?uso: e2e.sh <python|dotnet|maven|gradle>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)/$fixture"
cp -r "$root/examples/stacks/$fixture" "$work"

git_ci() { git -c user.email=ci@factory.local -c user.name=factory-ci "$@"; }
cd "$work"
git init -q -b main
git_ci add -A
git_ci commit -qm "proyecto de ejemplo"

echo "== instalador"
(cd "$root" && pnpm --silent run bootstrap -- --target "$work")
test -f .github/workflows/factory.yml
test "$(./factory onboard profile)" = "$(case "$fixture" in maven|gradle) echo jvm;; *) echo "$fixture";; esac)"

echo "== incorporación: instalar, compilar, probar y medir cobertura"
./factory onboard check
node -e '
  const c = JSON.parse(require("fs").readFileSync("docs/onboarding/checks.json", "utf8")).coverage;
  if (typeof c !== "number" || !(c > 50)) { console.error(`cobertura no medida o demasiado baja: ${c}`); process.exit(1); }
  console.log(`cobertura medida: ${c}%`);
'

echo "== puertas derivadas de commands:"
git_ci add -A
git_ci commit -qm "instalar la fábrica"
./factory gates --base HEAD --state .factory-state/gates.json

echo "== una prueba rota debe poner las puertas en rojo"
case "$fixture" in
  python) sed -i 's/== 5/== 6/' tests/test_calc.py ;;
  dotnet) sed -i 's/Equal(5,/Equal(6,/' Calc.Tests/CalculatorTests.cs ;;
  *) sed -i 's/assertEquals(5,/assertEquals(6,/' src/test/java/com/example/CalculatorTest.java ;;
esac
if ./factory gates --base HEAD --state .factory-state/gates-red.json; then
  echo "✘ las puertas quedaron en verde con una prueba rota"
  exit 1
fi
echo "✓ $fixture: instalador, incorporación y puertas funcionan (verde y rojo)"
