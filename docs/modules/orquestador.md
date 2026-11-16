# Orquestador de tickets

Scripts en `scripts/src/factory/`. No usan IA: llevan el estado y hacen cumplir las reglas mientras una sesión ejecuta a los agentes (modo "desde esta sesión, tú disparas").

## Piezas

- `github.ts` / `intake.ts`: adaptador de gestor de trabajo (interfaz `Tracker`) con la implementación de GitHub Issues por REST. Solo cuentan los tickets con la etiqueta `factory` puesta por alguien con permiso `admin`, `maintain`, `write` o `triage`. Si la consulta de permisos falla, se falla cerrado, salvo para el dueño de un repositorio personal. El texto del ticket se entrega recortado y envuelto como dato no confiable (`wrapUntrusted`).
- `jobs.ts`: máquina de estados de un trabajo (entrada, especificación, construcción, puertas, revisión, aprobación, observación). Fuera de orden se rechaza; repetir una etapa completada no cambia nada; 3 fallos o superar el presupuesto escalan; medio, alto o nivel desconocido esperan al dueño antes de la aprobación; un agente no puede bajar el nivel.
- `limits.ts`: lee el bloque `limites` de `docs/limits.md`. Falla cerrado si falta algo, hay valores inválidos o los reintentos superan 3.
- `outputs.ts`: un archivo por agente y su formato (`spec.md`, `review.md`, `security-review.md`, `decision.json`) validados por script.
- `evals.ts` y `evals/`: casos por rol con salida buena y mala de referencia. Prueban que el validador acepta lo correcto y rechaza lo incorrecto, incluido un ticket con una orden inyectada.
- `store.ts`: estado en `.factory-state/` (escritura atómica) e interruptor de emergencia por archivo.

## Cómo se usa

Ver `workflows/orquestador.WORKFLOW.md`. Comandos: `intake`, `status`, `ticket`, `stage`, `approve`, `check-output`, `eval`.

## Cómo se prueba

`pnpm --filter @factory/scripts test`. Además, se probó contra GitHub con un ticket real (entrada, sin duplicados, fuera de orden, interruptor de emergencia, presupuesto) y el analista se ejecutó en sesión limpia sobre los casos de `evals/analista/`.

## Límites conocidos

- La prioridad usa etiquetas `impacto:`, `urgencia:` y `costo:` (alto, medio, bajo); sin etiqueta cuenta como medio.
- El costo y los minutos de cada etapa los registra quien ejecuta la sesión; no se miden automáticamente.
- El tope de tickets automáticos por día lo aplica `factory observe` (ver `docs/modules/staging-y-reversion.md`).
- Las aprobaciones por panel y el botón de emergencia llegan con el panel de la fábrica; hoy el interruptor es un archivo.
- Los agentes arquitecto, devops, diseñador y mejora siguen siendo esqueletos.
