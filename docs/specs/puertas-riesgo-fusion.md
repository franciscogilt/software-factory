# Especificación: puertas, riesgo y fusión

- Ticket: fase 2, parte 1 (decisión del dueño)
- Producto: la fábrica (`scripts/`)
- Nivel de riesgo: alto (define cómo se aprueban todos los cambios y toca CI)
- Modo: completo

## Problema

Hoy el nivel de riesgo y la regla de fusión son texto en `docs/rules/autonomia.md`: dependen de que alguien las recuerde. La fábrica necesita scripts deterministas que clasifiquen el riesgo por los archivos tocados, ejecuten las puertas y se nieguen a fusionar sin la aprobación que exige el nivel. No usan IA ni tienen costo.

## Alcance

Incluye:

- `scripts/src/risk.ts`: clasifica una lista de archivos en nivel bajo, medio o alto, con motivos. Archivo desconocido = nivel medio; en la duda, el nivel superior. Un agente puede subir el nivel, nunca bajarlo.
- `scripts/src/mode.ts`: elige modo ligero o completo por los archivos tocados.
- `scripts/src/gates.ts`: ejecuta las puertas (estructura, tipos, linter, pruebas, licencias, auditoría de dependencias, documentación) y escribe el resultado en un archivo de estado por trabajo.
- `scripts/src/merge.ts`: decisión pura `decideMerge` más CLI que lee el PR con `gh api`, y fusiona solo si la decisión lo permite.
- Job de CI `risk` que calcula el nivel contra la rama base y etiqueta el PR con `risk:bajo|medio|alto`.
- `WORKFLOW.md` del flujo y documentación del módulo.

No incluye: orquestador de tickets, staging, despliegue, agentes (partes 2 a 4).

## Criterios de aceptación

- Dado cambios solo en `docs/` (salvo `docs/rules/`) o textos de i18n o estilos, cuando se clasifica, entonces el nivel es bajo.
- Dado un cambio en pagos, autenticación, permisos, migraciones, infraestructura, datos personales, workflows, Dockerfiles, `CLAUDE.md`, `docs/rules/`, `.claude/agents/` o `evals/`, cuando se clasifica, entonces el nivel es alto.
- Dado código de aplicación que no es de los anteriores, o un archivo desconocido, entonces el nivel es medio.
- Dado una mezcla de archivos, entonces gana el nivel más alto; sin archivos, el nivel es alto (duda).
- Dado un nivel sugerido por un agente menor al calculado, entonces se conserva el calculado; si es mayor, se usa el del agente.
- Dado un cambio bajo solo de documentación o textos, cuando se elige el modo, entonces es ligero; cualquier otro caso es completo, y un agente solo puede subirlo.
- Dado nivel bajo con puertas en verde, entonces `decideMerge` permite fusionar solo; con alguna puerta en rojo o pendiente, se niega.
- Dado nivel medio, entonces se exige aprobación de un revisor distinto del autor; sin ella, se niega.
- Dado nivel alto, entonces se exige la aprobación del dueño (cuenta verificada); la de cualquier otra cuenta no cuenta, y sin ella se niega.
- Dado un PR en borrador o con conflictos, entonces se niega siempre.
- Dado una puerta que falla, entonces el estado en disco registra cuál, su salida resumida y el tiempo; repetir la puerta sobrescribe, no duplica.

## Flujo crítico afectado

Ninguno del producto. Afecta el flujo de fusión de la propia fábrica.

## Preguntas abiertas

- Ninguna: las reglas vienen de `docs/rules/autonomia.md` y `flujo-fabrica.md`.
