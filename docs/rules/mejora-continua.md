# Mejora continua

Léelo al ejecutar o proponer mejoras a la fábrica.

## Mejora continua

La fábrica se mejora sola con un ciclo medido. El agente de mejora lo ejecuta con tareas programadas.

- Medir: tiempo por entrega, defectos que llegan a producción, retrabajo, costo por funcionalidad, aprobación al primer intento, incidentes, feedback de usuarios y lecciones aprendidas.
- Analizar: revisar métricas, postmortems, PR rechazados, escalados y gasto, y detectar patrones repetidos.
- Proponer: cambios concretos como pull requests (instrucciones de agentes, este archivo, plantillas, starter kit, pruebas, evaluaciones, dependencias o modelos), cada uno con su hipótesis y la métrica que debe mejorar.
- Probar: toda propuesta pasa las evaluaciones de `evals/` y se compara con la versión actual. Solo avanza si mejora y no empeora nada.
- Adoptar según el nivel de riesgo: bajo (plantillas, textos, documentación) se fusiona solo; medio (instrucciones de agentes, módulos del kit) lo aprueba el revisor y se informa en el resumen; alto (seguridad, permisos, límites de costo, aprobaciones humanas, cambio de modelo o de stack) lo aprueba el dueño.
- Verificar: tras adoptar un cambio, vigilar las métricas dos semanas y revertir si empeoran.
- Cadencia: ciclo semanal corto y revisión mensual más profunda (arquitectura del kit, dependencias, modelos y herramientas nuevos, estándares de seguridad).
- Barreras: el agente de mejora NO puede modificar las evaluaciones que lo juzgan, ni las reglas de seguridad, permisos, límites de costo y aprobaciones humanas, sin aprobación explícita del dueño. Un cambio a la vez cuando sea posible y siempre fácil de revertir. Presupuesto mensual fijo de costo y tiempo para mejoras. Registrar qué cambió, por qué y qué métrica movió.
- Productos ya entregados: las mejoras del starter kit se proponen a los productos existentes como pull requests de actualización, aprobados según su nivel de riesgo. En productos a la medida, solo si el cliente tiene contrato de mantenimiento.
