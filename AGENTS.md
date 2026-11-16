# AGENTS.md

Índice corto para agentes. Las reglas están en `CLAUDE.md`; el detalle, en `docs/rules/`.

| Tarea | Flujo |
|---|---|
| Producto nuevo desde cero | `docs/rules/flujo-fabrica.md` (modo completo) |
| Proyecto existente | `docs/rules/flujo-fabrica.md` (incorporación primero) |
| Cambio pequeño de riesgo bajo | `docs/rules/flujo-fabrica.md` (modo ligero) |
| Trabajar un ticket (de ticket a PR) | `workflows/orquestador.WORKFLOW.md` |
| Lanzar a staging o producción | `workflows/despliegue.WORKFLOW.md` |
| Incorporar un proyecto existente | `workflows/incorporacion.WORKFLOW.md` |
| Mejora de la fábrica | `docs/rules/mejora-continua.md` |

Instrucciones por rol: `.claude/agents/`. Cada flujo tiene su `WORKFLOW.md` en `workflows/` (hoy: `workflows/fusion.WORKFLOW.md` `workflows/orquestador.WORKFLOW.md` `workflows/despliegue.WORKFLOW.md` y `workflows/incorporacion.WORKFLOW.md`).
