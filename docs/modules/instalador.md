# Instalador de la fábrica

Código en `scripts/src/install/`. Instala la fábrica en una carpeta vacía (producto nuevo) o en un proyecto que ya existe, y deja todo listo para empezar. Especificación: `docs/specs/instalador.md`.

## Uso

Desde un clon de la fábrica (Node 22+, pnpm, y Git; Docker o PostgreSQL según el modo):

```sh
pnpm run bootstrap -- --target ~/proyectos/mi-producto            # pregunta Docker o PostgreSQL local si hay terminal
pnpm run bootstrap -- --target ~/proyectos/mi-producto --db docker
pnpm run bootstrap -- --target ~/proyectos/mi-producto --db local --database-url postgres://usuario:clave@localhost:5432/mi_producto
pnpm run bootstrap -- --target ~/proyectos/cliente-x --dry-run    # solo muestra qué haría
```

Opciones: `--name`, `--type saas|custom` (por defecto `saas` en carpeta vacía y `custom` en proyecto existente), `--dry-run`, `--force` (añade solo lo que falte a una instalación terminada).

## Qué hace

| Caso | Qué copia | Qué prepara |
|---|---|---|
| Carpeta vacía (nuevo) | Todo el starter kit, sin las especificaciones ni lecciones de la propia fábrica | `git init`, `product.config.yaml` (`validation: pending`), `README.md`, `.env` con secretos aleatorios (permisos 600), dependencias, base de datos (Docker o local) y migraciones |
| Proyecto existente | Solo `CLAUDE.md`, `AGENTS.md`, `.claude/agents`, `docs/rules`, `docs/templates`, `docs/limits.md`, `scripts/`, `workflows/`, `evals/` | `product.config.yaml` (`origin: existing`, perfil y `commands:` detectados), `./factory` (atajo), `.github/workflows/factory.yml` (puertas en cada PR), herramientas en `scripts/`, `onboard init`. En proyectos Node, `commands:` sale de los scripts de su `package.json` |

Modos de base de datos (solo producto nuevo; Postgres en ambos, SQLite descartado):

- `docker`: levanta solo `db` y `mail` con `infra/docker-compose.yml` + `infra/docker-compose.dev.yml` (publica 5432 y 1025 solo en localhost) y espera a que Postgres responda.
- `local`: usa el PostgreSQL de tu máquina. Verifica la conexión, crea la base si falta y explica cómo crear el usuario si no existe. Las credenciales viajan en variables `PG*`, nunca como argumentos.

## Reglas de seguridad

- Nunca sobrescribe ni borra. Un archivo distinto que ya exista se conserva; `CLAUDE.md` y `AGENTS.md` se guardan como `CLAUDE.factory.md` / `AGENTS.factory.md` para fusionarlos a mano.
- Todo se comprueba antes de copiar (Node 22+, pnpm, git, Docker o psql). No instala software del sistema: dice cómo instalarlo.
- Es repetible: una instalación interrumpida se retoma sola (`.factory-kit.json` con `complete: false`); una terminada se rechaza salvo `--force`.
- Si el proyecto existente ya tiene un `scripts/package.json` distinto, se detiene sin copiar nada.
- Los secretos generados no se imprimen.

## Cómo se prueba

`pnpm --filter @factory/scripts test` (21 pruebas con ejecutor simulado: detección, diagnóstico, plan de copia sin sobrescribir, `.env`, config, dry-run, reanudación, Docker, conexión local). Además se ejecutó de verdad: producto nuevo contra PostgreSQL real (modo local) y un proyecto Python existente (ningún archivo propio modificado; `./factory onboard check` y `gate` funcionan).

## Límites conocidos

- El modo `docker` publica Postgres en `127.0.0.1:5432` con usuario `factory` y clave `factory` (solo desarrollo local; cualquier usuario de esa máquina puede entrar). Los secretos de la app (`AUTH_SECRET`, etc.) sí son aleatorios por producto.
- Solo se copian entradas conocidas del kit (lista blanca); un archivo nuevo en la raíz del kit hay que añadirlo a `KIT_TOP` en `scripts/src/install/kit.ts`.
- Carrera teórica entre comprobar y escribir (alguien creando enlaces en el destino mientras corre): la copia usa banderas exclusivas, pero no se usa escritura temporal + `rename`. Corre el instalador en carpetas que solo tú controlas.
- Un marcador `.factory-kit.json` falso solo se detecta si la carpeta tiene archivos que no son del kit.

- Windows: no probado; usar WSL.
- El modo `docker` no se pudo probar con un demonio real (el entorno de desarrollo de la fábrica no lo tiene): solo con ejecutor simulado. Hay que verlo funcionar en tu máquina.
- En proyectos existentes, las herramientas de `scripts/` se instalan sin lockfile (versiones `^` actuales).
- La incorporación (`onboard check`) ejecuta código del proyecto: contenedor desechable si no es tuyo (ver `docs/modules/comandos-por-proyecto.md`).
