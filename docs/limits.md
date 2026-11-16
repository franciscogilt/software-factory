# Límites de costo y tiempo

El gerente define aquí el presupuesto por tarea; el orquestador lo lee y falla cerrado si falta o es inválido. Cambiarlo es de nivel alto: lo aprueba el dueño. Máximo 3 reintentos de la misma acción; al superar un límite, el trabajo se escala al dueño.

```limites
costo_por_tarea_usd: 5
tiempo_por_tarea_min: 120
reintentos_max: 3
trabajos_simultaneos: 2
tickets_automaticos_por_dia: 5
```

- `costo_por_tarea_usd`: tope por trabajo (suma de todas sus etapas). Valor inicial propuesto; sale de ajustar con las métricas reales de los primeros trabajos.
- `tiempo_por_tarea_min`: minutos de trabajo acumulados, no tiempo de calendario.
- `trabajos_simultaneos`: el resto queda en cola, ordenado por impacto, urgencia y costo.
- `tickets_automaticos_por_dia`: tope de tickets creados solos por la observación posterior (parte 3), para evitar bucles.
