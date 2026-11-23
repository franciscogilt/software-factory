# Especificación: instalador de la fábrica (parte 2 de «cualquier stack»)

- Origen: petición del dueño por voz («instalar la fábrica en una carpeta vacía o en un proyecto existente y que se encargue de instalar todo lo necesario para arrancar»; opción con Docker o sin Docker; SQLite descartado, solo Postgres).
- Producto: la fábrica (`scripts/src/install/`)
- Nivel de riesgo: alto (escribe en carpetas y proyectos del usuario, toca la base de datos local y el arranque de la fábrica)
- Modo: completo
- Depende de: PR #23 (comandos por proyecto), ya fusionado.

## Decisiones tomadas sin el dueño presente (revisables en el PR)

1. Comando: `pnpm run bootstrap -- --target <carpeta>` desde un clon de la fábrica (`pnpm install` y `pnpm setup` son comandos propios de pnpm, por eso `bootstrap`).
2. El instalador **nunca sobrescribe** archivos del destino y **no hace commits**; solo en un producto nuevo hace `git init` (sin commits). En proyectos existentes recomienda una rama y un PR.
3. No instala software del sistema (Node, pnpm, Docker, Postgres) por su cuenta: lo verifica y dice cómo instalarlo en el sistema detectado. Descargar e instalar programas sin que el dueño lo vea es un riesgo que no se justifica.
4. En proyectos existentes **no** se prepara base de datos (cada proyecto tiene la suya); eso queda para la incorporación.

## Alcance

Incluye:

- Detectar el caso: carpeta inexistente o vacía → producto nuevo; con archivos → proyecto existente; ya instalada → se niega (salvo `--force`, que solo añade lo que falte, sin sobrescribir).
- `doctor`: comprobar Git, Node ≥ 22, pnpm, y Docker (modo docker) o `psql`/`pg_isready` (modo local), con una sugerencia de instalación por sistema operativo.
- Modo de base de datos `docker` o `local`: se pregunta si hay terminal interactiva; sin ella, `--db` o, si falta, docker cuando está disponible y si no local.
- Producto nuevo: copiar el starter kit completo (archivos versionados de la fábrica, sin `docs/specs/` propios ni estado), generar `product.config.yaml` (validación pendiente), `.env` con secretos sintéticos de desarrollo, instalar dependencias, levantar Postgres (docker compose o servidor local), migrar y dejar el siguiente paso dicho.
- Proyecto existente: copiar solo las piezas de la fábrica (`CLAUDE.md`, `AGENTS.md`, `.claude/agents`, `docs/rules`, `docs/templates`, `docs/limits.md`, `scripts`, `workflows`, `evals`), detectar el stack y escribir `product.config.yaml` (`origin: existing`, `stack_profile` y `commands:`), instalar las dependencias de `scripts/`, correr `onboard init` y decir qué puerta falta.
- `--dry-run`: muestra exactamente qué haría, sin escribir nada.
- Salida final en español: qué se hizo, qué falta y el comando del siguiente paso.

No incluye: instalar Node/pnpm/Docker/Postgres, SQLite, hosting, CI del producto destino, generar el producto (funciones) ni cambiar el stack del kit.

## Criterios de aceptación

- Dada una carpeta inexistente o vacía, cuando se instala, entonces el modo es «nuevo»; dada una carpeta con archivos, «existente»; dada una con `product.config.yaml` y la marca de instalación, el instalador se niega con un mensaje claro.
- Dado cualquier destino, cuando un archivo ya existe, entonces no se sobrescribe: se conserva y se informa. Si es `CLAUDE.md` o `AGENTS.md`, la versión de la fábrica se guarda como `CLAUDE.factory.md` / `AGENTS.factory.md` y se pide fusionarlas.
- Dado `--dry-run`, entonces no se crea ni modifica ningún archivo ni se ejecuta ningún comando; la salida lista los archivos y pasos.
- Dado que falta Node ≥ 22, pnpm o git, o la herramienta del modo elegido, entonces el instalador se detiene antes de copiar nada y dice qué instalar (con la línea para el sistema detectado).
- Dado un producto nuevo, cuando termina, entonces existen el kit, `product.config.yaml` con `validation: pending` y `origin: new`, `.env` con secretos generados al azar (nunca los del ejemplo) que `git` ignora, y la base de datos con las migraciones aplicadas.
- Dado el modo `local`, entonces se usa `DATABASE_URL` si viene en el entorno o `--database-url`; si no, se propone `postgres://factory:factory@localhost:5432/<nombre>`; se verifica la conexión y se crea la base si no existe. Si no se puede conectar, se explica cómo y no se sigue.
- Dado el modo `docker`, entonces se levanta solo el servicio de Postgres de `infra/docker-compose.yml` y se espera a que esté listo, con tiempo límite; si Docker no responde, se detiene con el motivo.
- Dado un proyecto existente en Python, .NET o JVM, cuando termina, entonces `product.config.yaml` tiene `origin: existing`, el perfil y los comandos por defecto escritos de forma explícita (editables), y `onboard init` se ejecutó.
- Dado un proyecto existente, entonces ninguno de sus archivos fue modificado ni borrado (solo se añaden archivos de la fábrica).
- Dado un `product.config.yaml` ya existente en el destino, entonces se conserva, y solo se informa de lo que falta.
- Dado que un paso falla, entonces el instalador se detiene, dice qué se hizo y qué no, y es seguro volver a correrlo (repetir no duplica efectos ni sobrescribe).
- Dado que el nombre del producto o la ruta contienen caracteres peligrosos para comandos (espacios, `;`, `$`, comillas), entonces el nombre se sanea para nombres de base de datos y ningún valor del usuario se interpola en un shell.
- Dado que los secretos generados y la cadena de conexión se muestran, entonces no se imprimen secretos en la salida (solo su existencia).

## Flujo crítico afectado

Ninguno del producto. Es el punto de entrada de toda instalación nueva.

## Límites conocidos

- Windows: el instalador usa rutas y comandos de Linux/macOS; en Windows se recomienda WSL. No se probó en Windows.
- Docker y los contenedores no se pueden probar en el entorno de desarrollo de la fábrica (no hay demonio de Docker): el modo `docker` se verifica con un ejecutor simulado y por inspección; el modo `local` sí se prueba de verdad con un servidor Postgres.
- El instalador no valida que el proyecto existente compile: eso lo hace la incorporación.

## Preguntas abiertas

- Ninguna bloqueante; las decisiones 1–4 de arriba quedan para el dueño en el PR.
