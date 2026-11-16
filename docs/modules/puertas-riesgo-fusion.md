# Puertas, riesgo y fusión

Scripts en `scripts/src/` (paquete `@factory/scripts`). Son deterministas: no usan IA ni tienen costo. CI solo los invoca.

## Qué hace

- `risk.ts`: nivel `bajo | medio | alto` por los archivos tocados. Alto: migraciones, infraestructura, CI, contenedores, reglas de la fábrica, pagos, autenticación, permisos, datos personales y esquema. Bajo: documentación, textos de interfaz y estilos. Medio: el resto de código y todo archivo desconocido. Gana el nivel más alto; sin archivos cuenta como alto. Un agente puede subir el nivel (`--suggested`), nunca bajarlo.
- `mode.ts`: modo ligero solo para cambios bajos, pequeños y de solo documentación, textos o estilos. Todo lo demás es completo.
- `gates.ts`: ejecuta las puertas (estructura, tipos, linter, pruebas, licencias) y la puerta de documentación (código nuevo exige documentación de módulo, ADR o registro de cambios). Guarda el resultado en un archivo de estado por trabajo; repetir una puerta lo sobrescribe y la escritura es atómica.
- `merge.ts`: `decideMerge` es una función pura. Bajo: fusiona si las puertas pasan. Medio: exige la aprobación de un revisor distinto del autor sobre el último commit. Alto: exige la aprobación del dueño. Borrador, conflictos, puertas pendientes o cambios solicitados niegan siempre.

## Cómo se usa

```
pnpm --filter @factory/scripts risk --base origin/main [--worktree]
pnpm --filter @factory/scripts gates --tier rapida|completa --base origin/main --job <id> --state .factory-state/<id>.json
pnpm --filter @factory/scripts merge --pr <n> [--execute]
```

Sin `--execute`, `merge` solo muestra la decisión. Variables: `FACTORY_OWNER` (dueño, por defecto `franciscogilt`), `FACTORY_REVIEWERS` (cuentas de revisores, separadas por comas), `FACTORY_REQUIRED_CHECKS` (por defecto `check,image,backup,e2e`).

En CI, el job `risk` etiqueta cada PR con `risk:bajo|medio|alto`.

## Cómo se prueba

`pnpm --filter @factory/scripts test`. Cubre cada regla de riesgo, el modo, la decisión de fusión (incluida la aprobación sobre un commit viejo y el último voto por persona) y el estado en disco.

## Límites conocidos

- La lista de puertas está fija en `gates.ts`; se amplía al sumar pruebas de mutación y e2e en staging.
- Las reglas de riesgo son por ruta: un cambio de autenticación dentro de un archivo con otro nombre se clasifica medio hasta que el revisor lo suba.
- Aprobar con `--execute` aún no lo dispara nadie automáticamente; lo usa el orquestador (parte 2).
