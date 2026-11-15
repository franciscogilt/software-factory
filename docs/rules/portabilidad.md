# Portabilidad con Docker

Léelo al tocar Docker, infraestructura o despliegue.

## Portabilidad con Docker

Todo producto debe poder desplegarse en cualquier nube o servidor sin cambiar la aplicación.

- Cada aplicación tiene un `Dockerfile` multietapa con imagen base fijada, usuario sin privilegios y salida mínima (en Next.js, modo `standalone`). `docker-compose.yml` replica en local la estructura de producción: aplicación, PostgreSQL, cola y correo de prueba.
- Configuración solo por variables de entorno. Ningún secreto dentro de la imagen ni del repositorio.
- Migraciones de base de datos como un trabajo aparte que corre antes del despliegue. Endpoints de salud (vivo y listo) en toda aplicación.
- CI construye, escanea (Trivy o similar), firma y publica la imagen en un registro de contenedores, y genera el inventario de dependencias (SBOM).
- Prohibido atar la lógica del producto a un proveedor: archivos por la API compatible con S3, PostgreSQL estándar sin extensiones propietarias, colas sobre PostgreSQL o Redis estándar, métricas y trazas con OpenTelemetry, y correo, pagos e IA detrás de interfaces propias. Los servicios propios de una nube solo se usan si el cliente lo pide por escrito, y se registra en un ADR.
- Despliegue con infraestructura como código en `infra/`, un módulo por destino con la misma interfaz. Destinos oficiales: AWS (ECS con Fargate), Azure (Container Apps) y Google Cloud (Cloud Run), cada uno con su módulo en `infra/` y su receta probada. Docker Compose en una VM solo para desarrollo, pruebas o clientes con servidor propio. Kubernetes con Helm solo si el cliente ya lo usa. Cualquier otro destino lo resuelve el arquitecto y lo registra en un ADR.
- Prueba de portabilidad: una vez al mes y antes de cada lanzamiento grande, CI despliega la imagen en otro de los tres destinos oficiales, rotando y ejecuta pruebas de humo. Si falla, corregirlo antes de continuar con nuevas funciones.
- El destino de cada producto se define en `product.config.yaml` (campo de nube y región).
- Control de costos de nube: etiquetas obligatorias por producto, cliente y entorno en toda la infraestructura de `infra/`. Presupuestos y alertas en cada nube (AWS Budgets, Azure Cost Management o Google Cloud Billing) con aviso al 50%, 80% y 100%. Topes de escalado automático (mínimo y máximo de instancias). Entornos de prueba que se apagan fuera de horario. El resumen mensual del gerente compara el costo de cada producto con lo cobrado al cliente.
