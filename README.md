# software-factory

Fábrica de software con IA: construye SaaS propios y software a la medida, desde cero o sobre un proyecto existente, con pruebas y verificación antes de producción.

## Estado

Fase 0 (preparación). Aún no hay starter kit ni pipeline. Ver el plan completo en el documento de la fábrica.

## Cómo está organizado

- `CLAUDE.md` y `AGENTS.md`: reglas e índice para agentes.
- `docs/rules/`: reglas detalladas por tema.
- `.claude/agents/`: instrucciones por rol.
- `docs/templates/`: plantillas de spec, ADR y postmortem.
- `scripts/`: scripts de la fábrica en TypeScript (orquestador, puertas, fusión).
- `apps/`, `packages/`, `infra/`, `evals/`: se llenan en las fases siguientes.

## Comprobar el repositorio

```bash
pnpm install
pnpm check
```
