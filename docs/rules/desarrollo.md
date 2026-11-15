# Flujo de desarrollo y estándares de código

Léelo antes de escribir o revisar código.

## Flujo de trabajo obligatorio

1. Nada se programa sin una especificación aprobada en `docs/specs/` con criterios de aceptación.
2. Cada tarea va en su propia rama (`feat/`, `fix/`, `chore/`) y termina en un pull request pequeño y enfocado.
3. Quien escribe el código no lo revisa ni lo prueba. Todo PR lo revisa otro agente.
4. Ningún PR se fusiona si falla alguna comprobación de CI: tipos, linter, pruebas, escaneo de dependencias y de secretos.
5. Cada decisión de arquitectura importante se registra como ADR en `docs/adr/`.
6. Commits con mensajes claros en formato convencional (`feat: ...`, `fix: ...`).

## Estándares de código

- TypeScript estricto: sin `any` salvo justificación comentada.
- Funciones pequeñas, nombres descriptivos, sin código duplicado ni código muerto.
- Validar toda entrada externa en el servidor (por ejemplo con Zod). Nunca confiar en el cliente.
- Manejo de errores explícito. No tragar excepciones. Mensajes de usuario claros, sin detalles internos.
- Toda lógica de negocio con pruebas. Cobertura mínima de 80% en lógica de negocio.
- Accesibilidad básica (etiquetas, contraste, teclado) y diseño responsivo en toda interfaz.
- Estados vacíos y errores: toda pantalla sin datos explica qué es y ofrece la acción para empezar. Todo error dice qué pasó y qué hacer, sin detalles internos. El revisor lo comprueba en cada cambio de interfaz.
- Observabilidad: métricas y alertas en los flujos críticos (registro, inicio de sesión, pago y exportación: tasa de éxito, latencia y errores), con aviso al dueño ante fallos, y trazas para seguir una solicitud completa. Un flujo crítico nuevo no está terminado sin su alerta.
- Documentar en `docs/` cada módulo nuevo: qué hace, cómo se usa y cómo se prueba.
