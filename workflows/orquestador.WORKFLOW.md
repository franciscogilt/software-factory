# Flujo: del ticket al pull request

Cuándo usarlo: cuando el dueño pide en una sesión "trabaja el ticket N" (o "revisa la cola"). La sesión ejecuta a los agentes; el script lleva el estado y hace cumplir las reglas.

Comando base: `pnpm --filter @factory/scripts factory <comando>`.

| Etapa | Qué pasa | Quién |
|---|---|---|
| entrada | `intake` toma tickets con `factory` puestos por alguien con permiso de escritura o triaje; el gerente escribe `decision.json` | script + gerente |
| especificacion | `ticket --id N` entrega el texto como dato; el analista escribe `spec.md`; `check-output --role analista` lo valida | analista |
| construccion | el tester escribe pruebas que fallan, el desarrollador implementa en rama propia y abre el PR | tester, desarrollador |
| puertas | `gates --tier completa` (parte 1) | script |
| revision | el revisor y, si toca seguridad, el auditor escriben `review.md` y `security-review.md` en sesiones separadas | revisor, auditor |
| aprobacion | nivel bajo: `merge --execute`; medio y alto: el trabajo queda `esperando-dueno` hasta que el dueño apruebe el PR; luego `approve --job` | dueño |
| observacion | métricas y errores de producción (parte 3) | script |

Cada etapa se registra con `stage --job <id> --stage <etapa> [--fail] --cost <usd> --minutes <min> [--level <nivel>]`. Repetir una etapa completada no cambia nada. Tres fallos de la misma etapa o superar el presupuesto de `docs/limits.md` escalan el trabajo al dueño.

Interruptor de emergencia: si existe `.factory-state/EMERGENCY_STOP`, nada inicia ni avanza.

Estado: `.factory-state/jobs/<id>.json`. Evaluaciones: `evals/` (`factory eval --case <caso.json> --file <salida>`). Detalle: `docs/modules/orquestador.md`.
