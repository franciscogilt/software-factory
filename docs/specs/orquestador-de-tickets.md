# Especificación: orquestador de tickets

- Ticket: fase 2, parte 2 (decisión del dueño)
- Producto: la fábrica (`scripts/`, `.claude/agents/`, `evals/`)
- Nivel de riesgo: alto (límites de costo, instrucciones de agentes, entrada de tickets)
- Modo: completo

## Problema

Hoy un ticket no tiene camino definido hasta un PR: nadie controla las etapas, el costo, los reintentos ni quién puede pedir trabajo. Los agentes son esqueletos sin pruebas. El dueño dispara el trabajo desde una sesión (sin clave de API ni agentes en Actions), así que el orquestador es un script que lleva el estado y hace cumplir las reglas mientras la sesión ejecuta a los agentes.

## Alcance

Incluye:

- Adaptador de gestor de trabajo con interfaz única (listar, leer, comentar, etiquetar, quién etiquetó) y su implementación para GitHub Issues por REST.
- Entrada: solo tickets con la etiqueta `factory` puestos por alguien con permiso de escritura o triaje. El texto del ticket se entrega a los agentes como dato no confiable, con tope de tamaño.
- Estado por trabajo en disco (`.factory-state/jobs/<id>.json`): etapa, estado, intentos, costo, minutos e historial. Repetir una etapa no duplica efectos.
- Topes en `docs/limits.md` (costo y tiempo por tarea, reintentos, trabajos simultáneos, tickets automáticos por día), leídos por el script; si faltan, el script falla cerrado.
- Interruptor de emergencia por archivo: si existe, nada inicia ni avanza.
- Cola priorizada por impacto, urgencia y costo estimado (etiquetas del ticket).
- Validación de salidas: cada agente escribe exactamente un archivo (`spec.md`, `review.md`, `security.md`, `decision.json`) y su formato se valida por script.
- Agentes gerente, analista, desarrollador, tester, revisor y auditor-seguridad completados; evaluaciones en `evals/` con casos y comprobaciones deterministas.
- `workflows/orquestador.WORKFLOW.md` y documentación del módulo.

No incluye: staging y reversión (parte 3), incorporación de proyecto existente (parte 4), agentes ejecutados por API o Actions, aprobaciones por panel.

## Criterios de aceptación

- Dado un ticket con `factory` puesto por alguien sin permiso de escritura ni triaje, cuando corre la entrada, entonces no se crea trabajo.
- Dado un ticket ya convertido en trabajo, cuando corre la entrada otra vez, entonces no se duplica.
- Dado el tope de trabajos simultáneos alcanzado, entonces la entrada no inicia más y los deja en cola ordenados por prioridad.
- Dado el archivo de emergencia, entonces entrada y avance se niegan.
- Dado un trabajo, cuando se intenta completar una etapa fuera de orden, entonces se rechaza; si la etapa ya estaba completada, entonces no cambia nada (ni costo ni historial).
- Dado una etapa que falla 3 veces, entonces el trabajo pasa a `escalado`; un cuarto intento se rechaza.
- Dado costo o minutos acumulados por encima del tope, entonces el trabajo pasa a `escalado` por presupuesto.
- Dado un trabajo de nivel medio o alto que llega a aprobación, entonces queda `esperando-dueno`; nunca avanza solo.
- Dado un `docs/limits.md` sin los topes o con valores inválidos, entonces el script falla con un mensaje claro.
- Dado la salida de un agente con más archivos que el suyo o en otra ruta, entonces se rechaza.
- Dado un `spec.md` sin criterios dado-cuando-entonces o sin nivel de riesgo, entonces no pasa la validación; un `review.md` sin veredicto o un `decision.json` fuera de esquema, igual.
- Dado el texto de un ticket con instrucciones, entonces se entrega envuelto y marcado como dato y recortado al tope.

## Flujo crítico afectado

Ninguno del producto. Afecta cómo entra y se controla todo el trabajo de la fábrica.

## Preguntas abiertas

- Valores iniciales de los topes: propuestos en `docs/limits.md` (5 USD y 120 min por tarea); el dueño los confirma al fusionar.
