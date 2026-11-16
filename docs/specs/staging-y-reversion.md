# Especificación: staging, despliegue progresivo y reversión automática

- Ticket: fase 2, parte 3 (decisión del dueño)
- Producto: la fábrica (`infra/staging/`, `scripts/src/deploy/`, CI)
- Nivel de riesgo: alto (infraestructura, CI y despliegue)
- Modo: completo

## Problema

Ningún cambio debería llegar a producción sin probarse en un entorno igual a producción, con datos sintéticos y los flujos críticos de punta a punta. Hoy las pruebas e2e arrancan su propio servidor, no las imágenes reales, y no hay forma de verificar un despliegue ni volver atrás si falla. Además, los errores de producción no se convierten en trabajo.

## Alcance

Incluye:

- `infra/staging/docker-compose.yml`: mismas imágenes y estructura que producción, con secretos sintéticos obligatorios y sin construir nada.
- Corrección de `infra/docker-compose.yml`: faltaba la línea `worker:` y el servicio no existía.
- La suite e2e acepta `E2E_BASE_URL` y corre contra staging sin cambiar las pruebas.
- Job de CI `staging`: construye las imágenes, levanta staging, corre pruebas de humo y toda la suite e2e contra las imágenes reales.
- `scripts/src/deploy/`: pruebas de humo, vigilancia posterior al despliegue con decisión de reversión, y el flujo de lanzamiento (staging → humo → e2e → producción solo con aprobación del dueño → vigilancia → reversión automática).
- `scripts/src/factory/observe.ts`: convierte métricas de producción en tickets `factory` con control de duplicados y el tope diario de `docs/limits.md`.

No incluye: nube de pago ni un destino de producción concreto (el despliegue usa Docker Compose sobre cualquier host o contexto de Docker); reversión de migraciones (las migraciones son compatibles hacia atrás y se aprueban aparte); incorporación de proyecto existente (parte 4).

## Criterios de aceptación

- Dado staging levantado, cuando se corre la suite e2e con `E2E_BASE_URL`, entonces pasa completa contra las imágenes construidas.
- Dado un entorno sano, cuando corren las pruebas de humo, entonces pasan: vivo, listo, página principal, inicio de sesión y cabeceras de seguridad.
- Dado un entorno al que le falta una cabecera de seguridad o cuyo "listo" devuelve error, entonces las pruebas de humo fallan y dicen cuál.
- Dado un lanzamiento a producción sin aprobación del dueño, entonces se bloquea sin tocar producción.
- Dado el interruptor de emergencia activo, entonces no se despliega nada.
- Dado que staging falla en humo o en e2e, entonces no se despliega a producción y staging vuelve a la versión anterior.
- Dado un despliegue a producción cuya vigilancia falla 3 veces seguidas, entonces se revierte a la versión anterior, se avisa, y el resultado es `revertido`.
- Dado que no hay versión anterior o que la reversión falla, entonces se avisa con claridad y se escala; nunca se declara éxito.
- Dado un problema de métricas con un ticket abierto del mismo problema, entonces no se crea otro; dado el tope diario alcanzado, entonces no se crean más.
- Dado texto de métricas con poco tráfico (menos de 10 eventos), entonces no se genera ticket.

## Flujo crítico afectado

Todos: inicio de sesión, 2FA y el flujo principal ahora se prueban contra staging antes de desplegar.

## Preguntas abiertas

- Ninguna: producción se activa cuando el dueño elija destino y credenciales; el flujo ya exige su aprobación.
