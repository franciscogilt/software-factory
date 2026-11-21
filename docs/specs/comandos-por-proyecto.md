# Especificación: comandos por proyecto (fábrica para cualquier stack)

- Ticket: fase 3, decisión del dueño («necesito desarrollar en cualquier stack que me requiera»)
- Producto: la fábrica (`scripts/src/stack/`, puertas, incorporación, reglas de riesgo)
- Nivel de riesgo: alto (cambia puertas, clasificación de riesgo y la forma de ejecutar código de proyectos ajenos)
- Modo: completo
- Alcance de este PR: parte 1 de 2. La parte 2 es el instalador (otro PR, otra especificación).

## Problema

Las puertas, la incorporación y las reglas de riesgo asumen Node, pnpm y la estructura del starter kit (`apps/`, `packages/`). La fábrica sirve hoy para Next.js; para Python, .NET o Java los agentes y el flujo funcionarían, pero las puertas no sabrían cómo instalar, compilar ni probar.

## Alcance

Incluye:

- Bloque `commands:` opcional en `product.config.yaml` con `install`, `build`, `typecheck`, `lint`, `test`, `coverage`, `coverage_report` y `dev`. Un valor puede encadenar pasos con ` && `. Nunca se ejecuta con intérprete de comandos (shell): se separa en argumentos y se rechazan `; | > < $ \`` y similares.
- Perfiles por stack con valores por defecto: `node` (comportamiento actual, intacto), `python`, `dotnet`, `jvm` (Maven y Gradle). Se detectan por archivos marcadores; `stack_profile` en la configuración puede fijarlo. Lo declarado en `commands:` siempre manda sobre el perfil.
- Cobertura leída de tres formatos: `coverage-summary.json` (Vitest/Jest), Cobertura XML (coverage.py, coverlet) y JaCoCo XML.
- `onboard scan` reconoce lenguajes, pruebas y migraciones de Python, .NET y Java/Kotlin; `onboard check` y `onboard gate` usan el perfil.
- Puertas de la fábrica: si el producto declara `commands:`, las puertas se derivan de ahí (compilación, tipos, linter, pruebas); si no, siguen siendo las del starter kit.
- Puerta de documentación genérica (código fuente de cualquier lenguaje) para productos con `commands:`.
- Reglas de riesgo para otros stacks: migraciones (Alembic, EF Core, Flyway, Liquibase, Rails), manifiestos de dependencias y autenticación/permisos en cualquier lenguaje. Solo pueden subir el nivel, nunca bajarlo.

No incluye: el instalador, CI para otros stacks, imágenes Docker por stack, ni pruebas de mutación en otros lenguajes. Se anotan como límites conocidos.

## Criterios de aceptación

- Dado un `product.config.yaml` con `commands:` válido, cuando se lee, entonces se obtienen los comandos por nombre; un valor con `&&` produce varios pasos.
- Dado un comando con metacaracteres de shell (`; | $ \` > <`) fuera de comillas, o un paso vacío entre `&&`, cuando se lee, entonces se rechaza con un error que nombra la clave. Dentro de comillas se permiten (no hay shell).
- Dado un proyecto con `pyproject.toml` o `requirements.txt`, o `*.csproj`/`*.sln`, o `pom.xml`/`build.gradle(.kts)`, cuando se escanea, entonces el perfil indica `python`, `dotnet` o `jvm`; sin marcador ni `package.json`, `desconocido`.
- Dado un proyecto Node, cuando se corren las comprobaciones, entonces el comportamiento es idéntico al anterior (las pruebas actuales de incorporación siguen en verde sin cambios).
- Dado un proyecto Python con pruebas en verde, cuando se corren `onboard check` y `onboard gate`, entonces instala, prueba, mide cobertura con coverage.py y la puerta evalúa igual que en Node. (Verificado de verdad con un proyecto de ejemplo.)
- Dado un informe Cobertura XML, JaCoCo XML o JSON de resumen, cuando se parsea, entonces devuelve el porcentaje de líneas; un archivo ausente o mal formado devuelve `null` (no medida), nunca un número inventado.
- Dado un proyecto con `commands:`, cuando se ejecutan las puertas, entonces se ejecutan esos comandos; un paso que falla detiene los siguientes de esa puerta y la puerta queda en `fallo` con las últimas líneas.
- Dado un producto sin `commands:`, cuando se ejecutan las puertas, entonces son exactamente las de hoy.
- Dados archivos `alembic/versions/x.py`, `Migrations/2024_x.cs`, `db/migrate/x.rb`, `src/main/resources/db/migration/V2__x.sql`, entonces son nivel alto. Dados `requirements.txt`, `pyproject.toml`, `*.csproj`, `pom.xml`, `build.gradle`, entonces son al menos nivel medio. Dados `auth/login.py`, `AuthService.java`, `PermissionGuard.cs`, entonces son nivel alto.
- Dado que se ejecutan las comprobaciones de un proyecto o sus puertas derivadas, entonces el entorno es mínimo (sin secretos, con HOME privado) y cada paso tiene tiempo límite.
- Dado un `coverage_report` con `..` o ruta absoluta, un informe viejo, un porcentaje fuera de 0–100 o `lines-valid=0`, entonces no se mide cobertura (nunca se inventa un número).
- Dada una `stack_profile` inválida, una clave repetida o un `product.config.yaml` ilegible, entonces la puerta queda en rojo con el nombre de la clave; nunca verde ni una caída.
- Dado un producto con `commands:` sin `test`, entonces la puerta de pruebas falla.

## Flujo crítico afectado

Ninguno del producto. Cambia cómo la fábrica verifica proyectos de cualquier stack.

## Límites conocidos (se declaran, no se ocultan)

El detalle completo está en `docs/modules/comandos-por-proyecto.md` (seguridad de la ejecución y límites). Resumen: sin shell no es aislamiento; con `commands:` se pierden las puertas de licencias y estructura del kit; la cobertura de Python por defecto cuenta las pruebas.

- Los valores por defecto de `python` suponen Linux o macOS (`.venv/bin/`); en Windows hay que declarar `commands:`.
- JaCoCo y coverlet deben estar configurados en el proyecto; si no, la cobertura sale «no medida» y la puerta de incorporación falla diciendo cómo corregirlo.
- En el entorno de desarrollo de la fábrica (sandbox) solo se puede ejecutar de verdad Python; Java y .NET se verifican con proyectos y salidas de ejemplo, sin compilación real. Se validan en la máquina del dueño con el instalador.

## Preguntas abiertas

- Ninguna: el alcance y los stacks (Python, .NET, Java/Kotlin) los decidió el dueño.
