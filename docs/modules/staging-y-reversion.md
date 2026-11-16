# Staging, despliegue progresivo y reversión

Scripts en `scripts/src/deploy/` (comando `pnpm --filter @factory/scripts rollout`) e `infra/staging/`. Sin nube de pago: Docker Compose sobre cualquier host o contexto de Docker.

## Staging

`infra/staging/docker-compose.yml` usa las mismas imágenes y la misma estructura que producción (base de datos, migración como trabajo aparte, web, worker, correo de prueba). No construye nada: toma `IMAGE_TAG`. Los secretos son sintéticos y obligatorios (si falta uno, falla): `rollout staging-env --out <archivo>` genera valores desechables. Los datos los siembra la suite e2e con el script sintético de `packages/db/seed`; nunca se copian datos reales.

## Pruebas

- Humo (`rollout smoke --url`): vivo, listo, página principal, inicio de sesión, cabeceras de seguridad (HSTS solo en https) y que `/api/metrics` esté cerrado sin token.
- e2e: la misma suite con `E2E_BASE_URL` contra el entorno desplegado (flujos críticos: inicio de sesión, 2FA, permisos entre organizaciones, privacidad, reportes).

## Lanzamiento (`rollout release --version V --env staging|production`)

1. Despliega a staging, corre humo y e2e. Si algo falla, restaura la versión anterior de staging y no toca producción.
2. Para producción exige `--owner-approved`; sin él, queda `bloqueado` y avisa. El interruptor de emergencia (`.factory-state/EMERGENCY_STOP`) lo impide todo.
3. Despliega a producción, corre humo y vigila (`--watch` segundos, cada 15 s). Con 3 fallos seguidos revierte solo a la versión anterior y avisa. Sin versión anterior, o si la reversión falla, escala al dueño y nunca declara éxito.
4. Cada lanzamiento queda en `.factory-state/releases.jsonl`. Variables para producción: `PRODUCTION_URL`, `PRODUCTION_COMPOSE_FILE`, `PRODUCTION_ENV_FILE`, `PRODUCTION_DOCKER_CONTEXT`.

La reversión vuelve la versión del código. Las migraciones son compatibles hacia atrás y se aprueban aparte, así que la versión anterior sigue funcionando con la base nueva.

## Observación posterior (`factory observe --metrics-url <url> [--dry-run]`)

Lee `/api/metrics` de producción (con `METRICS_TOKEN`) y crea tickets `factory` + `origen:observacion` por flujos con más de 20% de fallos (mínimo 10 eventos), trabajos fallidos y cola detenida. Cada ticket lleva una huella: no se duplica mientras haya uno abierto, y hay un tope diario (`tickets_automaticos_por_dia` en `docs/limits.md`).

## CI

El job `staging` construye las imágenes, levanta staging con secretos sintéticos enmascarados y ejecuta `rollout release --env staging`: es decir, la misma ruta que un despliegue real.

## Cómo se prueba

`pnpm --filter @factory/scripts test` (humo, vigilancia, lanzamiento con fallos en cada punto, reversión, observación contra el formato real de métricas). Además, humo y los 40 e2e se ejecutaron contra un servidor externo con la estructura de la imagen.

## Límites conocidos

- Producción aún no tiene destino: se activa al configurar las variables de arriba. Hasta entonces, el lanzamiento a producción se niega por falta de `PRODUCTION_URL`.
- La vigilancia usa las pruebas de humo; no mide tasa de errores del tráfico real (eso lo cubre `observe`, después).
- El aviso al dueño se imprime; el correo y el panel llegan con el panel de la fábrica.
- Los plazos de vulnerabilidades (24 h, 7 d, 30 d) aún no crean tickets: pendiente.
