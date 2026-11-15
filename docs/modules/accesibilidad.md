# Módulo: accesibilidad en CI (WCAG 2.2 AA)

## Qué hace
`apps/e2e/tests/accessibility.spec.ts` analiza con axe-core las pantallas clave en español e inglés: inicio, login, inicio de la app, 2FA (sin activar, con QR y verificada) y panel de la organización (miembros, auditoría, trabajos, reportes). Etiquetas: WCAG 2.0, 2.1 y 2.2 niveles A y AA. Cualquier violación falla la prueba, y como `e2e` es una comprobación obligatoria de CI, un PR con fallos de accesibilidad no se fusiona.

## Cómo se usa
- Pantalla nueva: añadirla a la lista del spec (ruta y estado en que se ve).
- Una prueba extra comprueba que el analizador realmente detecta problemas (imagen sin texto alternativo, campo sin etiqueta, botón sin nombre).
- Ejecutar: `pnpm --filter @factory/e2e test` (o solo `tests/accessibility.spec.ts`).

## Límites conocidos
- Las herramientas automáticas detectan solo una parte de los problemas. Falta revisión manual de teclado, foco visible, lector de pantalla y zoom, que el diseñador revisa en cada cambio de interfaz.
- No cubre aún estados de error tras enviar formularios ni los códigos de recuperación recién generados.
- PWA y diseño responsivo siguen pendientes.
