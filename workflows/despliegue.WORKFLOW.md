# Flujo: lanzamiento a staging y producción

Cuándo usarlo: antes de que un cambio fusionado llegue a producción, y tras desplegar.

1. `rollout staging-env --out <archivo>`: secretos sintéticos de staging.
2. `rollout release --version <tag> --env staging`: despliega, humo y e2e completos.
3. Producción: el dueño aprueba; entonces `rollout release --version <tag> --env production --owner-approved`.
4. Si la vigilancia falla, el script revierte solo y avisa. Con `exit 4` en `rollout verify` también se debe revertir.
5. `factory observe --metrics-url <url>` (programado) convierte problemas de producción en tickets.

Estado: `.factory-state/releases.jsonl`. Detalle: `docs/modules/staging-y-reversion.md`.
