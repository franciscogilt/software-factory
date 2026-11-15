# Ejecución, calidad y roles de los agentes

Léelo al trabajar como agente o al cambiar instrucciones de agentes.

## Ejecución y calidad de los agentes

- Cada tarea de un agente corre en un contenedor aislado y desechable, con el repositorio clonado, sin acceso a producción y con tokens de alcance mínimo. Las tareas se disparan desde GitHub Actions o tareas programadas, en paralelo y cada una en su propia rama.
- Cada ejecución tiene presupuesto de costo y tiempo, registra todo lo que hizo y termina en un pull request o en un escalado al dueño. El gerente asigna tareas, vigila la cola y reintenta o escala las que fallan. Guardar los registros para auditoría y mejora continua.
- Especificación con pruebas ejecutables: el analista escribe criterios de aceptación verificables (dado, cuando, entonces). El tester los convierte en pruebas automáticas antes de que se programe la funcionalidad, y deben fallar al inicio. El desarrollador termina cuando todas pasan y no puede modificarlas sin aprobación del revisor.
- Pruebas de mutación sobre la lógica de negocio, con puntaje mínimo sugerido de 70%. Si la puntuación baja de ese umbral, el tester debe reforzar las pruebas antes de fusionar.
- El revisor y el auditor de seguridad trabajan en sesiones separadas del desarrollador: no ven su razonamiento, solo la especificación, el código modificado y los resultados de las pruebas. Sus instrucciones son adversarias: buscar fallos, casos límite y violaciones de este archivo, no confirmar que todo se ve bien.
- Todos los agentes usan el mismo modelo, así que comparten puntos ciegos. Compensarlo con herramientas que no dependen de la IA (pruebas de mutación, análisis estático, escaneos de seguridad y de licencias) y con la revisión del dueño en los cambios de nivel alto.

## Roles de agentes

Las instrucciones detalladas de cada rol están en `.claude/agents/`:

- **gerente:** único interlocutor del dueño; coordina a los demás agentes, prioriza y mantiene el tablero.
- **diseñador:** define el sistema de diseño (colores, tipografía, espaciado y componentes de `packages/ui`), adapta la marca de cada producto, diseña pantallas y flujos con criterios de accesibilidad y revisa que la interfaz construida respete el diseño, los estados vacíos y los mensajes de error.
- **mejora:** ejecuta el ciclo de mejora continua; propone cambios medidos a la fábrica y nunca modifica sus propias barreras ni las evaluaciones que lo juzgan.
- **analista:** convierte ideas en especificaciones con criterios de aceptación.
- **arquitecto:** diseña stack, datos y API; registra decisiones.
- **desarrollador:** implementa en ramas y abre PR con pruebas.
- **revisor:** revisa lógica, legibilidad y deuda técnica; no escribe la funcionalidad que revisa.
- **tester:** escribe y ejecuta pruebas unitarias, de integración y de extremo a extremo.
- **auditor-seguridad:** revisa autenticación, permisos, entradas, dependencias y secretos; clasifica hallazgos por severidad.
- **devops:** mantiene CI/CD, entornos, respaldos, monitoreo y reversión.
