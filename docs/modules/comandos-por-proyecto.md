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
- Un valor encadena pasos con ` && `. Se ejecutan **sin shell**: se separan en argumentos y se rechazan `; | > < $ \` & \` (barra invertida), saltos de línea y bytes nulos fuera de comillas. Las comillas simples y dobles agrupan un argumento y **dentro de ellas se permite cualquier carácter** (no hay shell que lo interprete). Un comentario `# …` tras el valor se ignora. `stack_profile` inválido, claves repetidas y bloques `|`/`>` fallan nombrando la clave.
- `coverage_report` es una ruta relativa dentro del proyecto (sin `..` ni ruta absoluta). Antes de medir se borran los informes anteriores, y con varias coincidencias (`*`) se lee el más reciente.
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
- Riesgo: migraciones (Alembic, EF Core, Flyway, Liquibase, Rails), autenticación, permisos, seguridad y pagos en cualquier lenguaje (por nombre de archivo o de carpeta), CI de otras plataformas y los scripts de `stack/` y `onboard/` son nivel alto; manifiestos de dependencias, al menos medio; `product.config.yaml` es nivel alto porque define qué corren las puertas.

## Cómo se prueba

`pnpm --filter @factory/scripts test` (lector seguro de comandos, perfiles, escaneo de Python/.NET/Java, comprobaciones con ejecutor simulado, lectores de cobertura, puertas derivadas, riesgo). Además se probó de verdad con un proyecto Python de ejemplo: instalación en venv, pytest, cobertura 100%, puerta de incorporación en verde y puertas derivadas en verde y en rojo (prueba rota).

## Seguridad de la ejecución

- `onboard check` y las puertas derivadas corren con entorno mínimo (sin tokens de quien las lanza), **HOME privado** del proyecto (`.factory-state/home`) y tiempo límite por paso. Es una mitigación, **no aislamiento**: «sin shell» no impide que un comando declarado haga cualquier cosa (`python -c`, `sh -c`, scripts de instalación de pip o Maven). Los comandos de un proyecto ajeno equivalen a ejecutar su código: usar un contenedor desechable.
- Los informes de cobertura se validan (0–100, sin comentarios XML falsos, `lines-valid=0` es «no medida»), pero un proyecto malicioso puede escribir un informe falso con su propio comando. La puerta no juzga la calidad de las pruebas.
- `.factory-state/`, `.venv/`, `coverage.xml` y `.coverage` quedan en la carpeta del proyecto: añadirlos a `.gitignore`.

## Límites conocidos

- HOME privado también en Node: se pierden `~/.npmrc` y las cachés, así que un proyecto con registro privado con token fallará en la instalación hasta declarar `commands.install` o usar un contenedor con la configuración. Es el precio de no exponer el HOME real.
- El tiempo límite de 30 minutos por paso aplica también a las puertas del starter kit.
- `docs/security/*.md` (registros de pruebas de penetración) pasa a nivel alto por la regla de carpetas de seguridad; es la dirección segura.

- Con `commands:` se **descartan las puertas del starter kit** (estructura, licencias): el producto solo tiene compilación, tipos, linter, pruebas y documentación. El escaneo de secretos y de dependencias debe darlo el CI del producto; hoy no hay sustituto en otros stacks.
- La cobertura por defecto de Python (`--cov=.`) cuenta también los archivos de prueba y la infla: declarar `commands.coverage` con `--cov=<paquete>` para medir solo el código fuente.
- Un proyecto Python con `package.json` en la raíz se detecta como Node: fijar `stack_profile: python`. Con solo `setup.py`/`Pipfile`, o `requirements.txt` en una subcarpeta, declarar `commands.install`.
- `test: "true"` o un comando que sale en 0 sin ejecutar pruebas deja la puerta en verde; la puerta de incorporación lo mitiga exigiendo archivos de prueba y cobertura, la revisión humana hace el resto.

- Los valores por defecto de Python suponen Linux o macOS (`.venv/bin/`). En Windows hay que declarar `commands:`.
- JaCoCo y coverlet deben estar configurados en el proyecto; si no, la cobertura sale «no medida» y la puerta de incorporación lo dice.
- Java y .NET se verificaron con proyectos y salidas de ejemplo, **sin compilación real** (el entorno de desarrollo de la fábrica no puede descargar Maven ni NuGet). Hay que validarlos en una máquina con esas herramientas antes de confiar en ellos en un cliente.
- El CI de GitHub Actions y las imágenes Docker siguen siendo las del starter kit; CI por stack es un trabajo aparte.
- Pruebas de mutación solo existen para la lógica del starter kit.
