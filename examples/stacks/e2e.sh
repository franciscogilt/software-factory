#!/usr/bin/env bash
# Prueba de punta a punta de la fábrica en otro stack, como la haría el dueño:
# copia el proyecto de ejemplo, le instala la fábrica, corre la incorporación (con cobertura real) y las puertas.
set -euo pipefail
fixture="${1:?uso: e2e.sh <python|dotnet|maven|gradle>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
work="$tmp/$fixture"
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
  python) file=tests/test_calc.py; from='== 5'; to='== 6' ;;
  dotnet) file=Calc.Tests/CalculatorTests.cs; from='Equal(5,'; to='Equal(6,' ;;
  *) file=src/test/java/com/example/CalculatorTest.java; from='assertEquals(5,'; to='assertEquals(6,' ;;
esac
sed -i "s/$from/$to/" "$file"
grep -qF "$to" "$file" || { echo "✘ no se pudo romper la prueba en $file"; exit 1; }
if ./factory gates --base HEAD --state .factory-state/gates-red.json; then
  echo "✘ las puertas quedaron en verde con una prueba rota"
  exit 1
fi
# It must be red for the right reason: dependencies installed fine and the test gate caught the broken test.
node -e '
  const g = JSON.parse(require("fs").readFileSync(".factory-state/gates-red.json", "utf8")).gates;
  if (g.instalacion && g.instalacion.status !== "ok") { console.error("✘ falló la instalación, no la prueba"); process.exit(1); }
  if (!g.pruebas || g.pruebas.status !== "fallo") { console.error("✘ la puerta de pruebas no detectó la prueba rota"); process.exit(1); }
'
echo "✓ $fixture: instalador, incorporación y puertas funcionan (verde y rojo)"
