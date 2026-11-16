# Flujo: puertas, riesgo y fusión

Cuándo usarlo: todo PR, siempre.

1. `risk --base origin/main`: obtiene nivel y modo. Un agente puede subir el nivel con `--suggested`.
2. `gates --tier rapida` antes de revisión; `gates --tier completa` antes de fusionar.
3. Revisión según nivel (ver `docs/rules/autonomia.md`).
4. `merge --pr <n>` muestra la decisión; `--execute` fusiona solo si está permitido.

Estado: `.factory-state/<trabajo>.json` (una entrada por puerta). Plantillas: `docs/templates/spec.md`.
Detalle del módulo: `docs/modules/puertas-riesgo-fusion.md`.
