# Especificación: incorporar un proyecto existente

- Ticket: fase 2, parte 4 (decisión del dueño)
- Producto: la fábrica (`scripts/src/onboard/`, agentes, evaluaciones)
- Nivel de riesgo: alto (puerta que decide cuándo se acepta trabajo en un proyecto ajeno; reglas de agentes)
- Modo: completo

## Problema

La fábrica también trabaja sobre proyectos que ya existen (de clientes o del dueño). Cambiarlos sin entenderlos ni tener una red de seguridad es la forma más rápida de romperlos. La regla existe en texto (`docs/rules/flujo-fabrica.md`); falta hacerla cumplir por script.

## Alcance

Incluye:

- `onboard scan`: inventario determinista del proyecto (lenguajes, gestor de paquetes, marcos, scripts, pruebas, CI, Docker, migraciones, deudas marcadas, candidatos a flujos críticos). No ejecuta código del proyecto.
- `onboard init`: crea `docs/onboarding/` (estado, manifiesto de la red de seguridad) con el proyecto en estado `pendiente`.
- `onboard check`: ejecuta instalación, compilación, tipos, linter y pruebas del proyecto con entorno mínimo (sin secretos), tiempos límite y registro; mide cobertura si hay ejecutor de pruebas conocido.
- `onboard gate`: la red de seguridad pasa solo si hay mapa válido, el proyecto compila y sus pruebas pasan, cada flujo crítico declarado tiene pruebas de caracterización existentes que están en verde, y se midió la cobertura. Al pasar, marca el proyecto `completo`.
- El orquestador se niega a iniciar tickets de un proyecto con `origin: existing` mientras no esté `completo`.
- Agente arquitecto completado (escribe el mapa `docs/onboarding/map.md`, validado por script) y tester ampliado a pruebas de caracterización; evaluación del arquitecto.
- `workflows/incorporacion.WORKFLOW.md` y documentación del módulo.

No incluye: arreglar errores del proyecto (se anotan como deudas, no se corrigen aquí), migrar su stack, ni cambiar sus convenciones.

## Criterios de aceptación

- Dado un proyecto Node con Next y Vitest, cuando se escanea, entonces el perfil lista sus marcos, scripts, cantidad de archivos de prueba y los candidatos a flujos críticos por ruta (autenticación, pagos, etc.), sin ejecutar nada.
- Dado un proyecto sin pruebas, cuando se escanea, entonces el perfil lo marca y la puerta falla con "sin red de seguridad".
- Dado que el proyecto no compila o sus pruebas fallan, cuando se corre la puerta, entonces falla y dice que arreglar eso es el primer trabajo.
- Dado un flujo crítico sin pruebas de caracterización (o con archivos inexistentes), entonces la puerta falla y nombra el flujo.
- Dado un mapa al que le faltan secciones (arquitectura, módulos, convenciones, dependencias, deudas, flujos críticos, cómo correrlo), entonces no es válido.
- Dado todo lo anterior en verde y cobertura medida, entonces la puerta pasa y el estado queda `completo` con fecha, cobertura y commit.
- Dado un proyecto `origin: existing` en estado `pendiente`, cuando el orquestador intenta iniciar tickets, entonces se niega con el motivo.
- Dado un proyecto `origin: new` o sin `origin`, entonces la puerta no aplica.
- Dado que se ejecutan las comprobaciones del proyecto, entonces el entorno no incluye secretos del que ejecuta y cada orden tiene tiempo límite.

## Flujo crítico afectado

Ninguno del producto. Cambia cómo la fábrica acepta trabajo en proyectos ajenos.

## Preguntas abiertas

- Ninguna: las reglas vienen de `docs/rules/flujo-fabrica.md`.
