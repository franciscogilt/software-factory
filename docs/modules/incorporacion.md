# Incorporación de un proyecto existente

Scripts en `scripts/src/onboard/` (comando `pnpm --filter @factory/scripts onboard <comando> --path <proyecto>`). Hace cumplir por script la regla "incorporación primero" de `docs/rules/flujo-fabrica.md`.

## Pasos

1. `onboard init`: crea `docs/onboarding/` en el proyecto (`state.json` en `pendiente`, `safety-net.json` con los candidatos a flujos críticos, `profile.json`). Se declara `origin: existing` en `product.config.yaml`.
2. `onboard scan`: inventario sin ejecutar código del proyecto (lenguajes, gestor, marcos, scripts, pruebas, CI, Docker, migraciones, marcas de deuda, candidatos a flujos críticos por ruta).
3. El **arquitecto** lee el proyecto y escribe `docs/onboarding/map.md`: cómo correrlo, arquitectura, módulos, convenciones, dependencias, deudas y flujos críticos. Se valida con `factory check-output --role arquitecto`.
4. El **tester** escribe pruebas de caracterización (registran lo que el código hace hoy, sin corregirlo) con `characterization` en el nombre y las lista por flujo en `safety-net.json`. Los errores que encuentre son deudas, no arreglos.
5. `onboard check`: instala, compila, comprueba tipos, linter y pruebas con el propio proyecto, en un entorno mínimo (sin secretos de quien lo corre) y con tiempos límite; mide cobertura. Funciona con Node (Vitest/Jest), Python, .NET y Java/Kotlin: ver `docs/modules/comandos-por-proyecto.md`.
6. `onboard gate`: pasa solo si hay mapa válido, el proyecto compila y sus pruebas pasan, cada flujo crítico declarado tiene pruebas de caracterización existentes y se midió la cobertura. Al pasar, `state.json` queda `completo` con fecha, commit y cobertura. Si el proyecto no corre, la puerta lo dice: arreglar eso es el primer trabajo.

## Efecto en el orquestador

`factory intake` se niega a iniciar tickets si el producto tiene `origin: existing` y su incorporación no está `completa`. `FACTORY_PRODUCT_DIR` indica la carpeta del producto (por defecto, la actual). En productos nuevos no aplica.

## Cómo se prueba

`pnpm --filter @factory/scripts test` (escaneo, comprobaciones con ejecutor simulado, cobertura, mapa, puerta y orquestador). Además se probó de punta a punta con un proyecto de ejemplo: la puerta falló sin pruebas ni mapa; el arquitecto y el tester reales produjeron el mapa y 12 pruebas de caracterización; la puerta pasó con cobertura 100% y el orquestador cambió de negarse a aceptar tickets.

## Límites conocidos

- `onboard check` ejecuta los scripts del proyecto (instalación incluida). Hacerlo solo en un contenedor desechable, nunca en una máquina con secretos: el entorno no lleva secretos (y el HOME es privado del proyecto), pero el sistema de archivos sí es accesible.
- El escaneo y las comprobaciones leen los scripts de la raíz; en monorepos con scripts por paquete, el arquitecto debe indicar cómo correrlos y se ajusta `safety-net.json`.
- La cobertura se lee de `coverage-summary.json` (Vitest/Jest), Cobertura XML (coverage.py, coverlet) o JaCoCo XML; si el proyecto no genera uno de esos informes, la puerta falla hasta que se declare `commands.coverage` y `commands.coverage_report`.
- La puerta exige que las pruebas existan, pasen y lleven el nombre; no juzga su calidad (eso lo revisa el revisor y las pruebas de mutación).
- Perfiles con valores por defecto: Node, Python, .NET y JVM. Go, Ruby, PHP y otros se inventarían, pero necesitan declarar `commands:` a mano.
