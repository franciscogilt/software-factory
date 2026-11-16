# Comandos por proyecto (cualquier stack)

Scripts en `scripts/src/stack/` (`commands.ts`, `profiles.ts`, `coverage.ts`). Permiten que las puertas y la incorporación funcionen con Python, .NET, Java/Kotlin o cualquier stack, sin cambiar el flujo, los agentes ni los niveles de riesgo.

## Cómo se declara

En `product.config.yaml` del producto:

```yaml
stack_profile: python   # auto | node | python | dotnet | jvm
commands:
  install: python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt && .venv/bin/python -m pip install pytest pytest-cov
  test: .venv/bin/python -m pytest -q
  coverage: .venv/bin/python -m pytest -q --cov=. --cov-report=xml:coverage.xml
  coverage_report: coverage.xml
```

- Claves: `install`, `build`, `typecheck`, `lint`, `test`, `coverage`, `coverage_report`, `dev`. `test` es obligatorio: sin él, las puertas fallan.
- Un valor encadena pasos con ` && `. Se ejecutan **sin shell**: se separan en argumentos y se rechazan `; | > < $ \` &` y saltos de línea. Las comillas simples y dobles agrupan un argumento.
- Lo declarado manda sobre el perfil, clave por clave. Sin `commands:`, un producto Node sigue usando sus scripts de `package.json` y el starter kit sus puertas de siempre.

## Perfiles por defecto

| Perfil | Marcadores | Instala / prueba | Informe de cobertura |
|---|---|---|---|
| node | `package.json` | gestor detectado (pnpm, npm, yarn, bun) y scripts | `coverage/coverage-summary.json` |
| python | `pyproject.toml`, `requirements*.txt`, `setup.py` | venv + pip, `pytest` | `coverage.xml` (pytest-cov) |
| dotnet | `*.sln`, `*.csproj` | `dotnet restore/build/test` | `coverage/*/coverage.cobertura.xml` (coverlet) |
| jvm | `pom.xml`, `build.gradle(.kts)` | Maven o Gradle (`./gradlew` si existe) | JaCoCo XML |

## Qué cambia en la fábrica

- `onboard scan/check/gate`: reconocen el stack, ejecutan sus comandos con el mismo entorno mínimo y tiempos límite, y leen la cobertura del informe.
- `gates`: si hay `commands:`, las puertas son compilación, tipos, linter y pruebas derivadas de ahí, más la de documentación (genérica: código en cualquier lenguaje). Sin `commands:`, son las del starter kit.
- Riesgo: migraciones (Alembic, EF Core, Flyway, Liquibase, Rails), autenticación, permisos y pagos en cualquier lenguaje son nivel alto; manifiestos de dependencias, al menos medio; `product.config.yaml` es nivel alto porque define qué corren las puertas.

## Cómo se prueba

`pnpm --filter @factory/scripts test` (lector seguro de comandos, perfiles, escaneo de Python/.NET/Java, comprobaciones con ejecutor simulado, lectores de cobertura, puertas derivadas, riesgo). Además se probó de verdad con un proyecto Python de ejemplo: instalación en venv, pytest, cobertura 100%, puerta de incorporación en verde y puertas derivadas en verde y en rojo (prueba rota).

## Límites conocidos

- Los valores por defecto de Python suponen Linux o macOS (`.venv/bin/`). En Windows hay que declarar `commands:`.
- JaCoCo y coverlet deben estar configurados en el proyecto; si no, la cobertura sale «no medida» y la puerta de incorporación lo dice.
- Java y .NET se verificaron con proyectos y salidas de ejemplo, **sin compilación real** (el entorno de desarrollo de la fábrica no puede descargar Maven ni NuGet). Hay que validarlos en una máquina con esas herramientas antes de confiar en ellos en un cliente.
- El CI de GitHub Actions y las imágenes Docker siguen siendo las del starter kit; CI por stack es un trabajo aparte.
- Pruebas de mutación solo existen para la lógica del starter kit.
