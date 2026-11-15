# Catálogo de funciones del starter kit

Léelo al activar o construir un módulo del kit.

## Catálogo de funciones del starter kit

Cuáles van en un producto lo define la sección anterior.


- Panel administrativo, reportes y dashboards: usuarios, planes, ingresos, uso y actividad, con filtros por fecha y exportación a CSV y PDF. Acceso solo para roles de administración.
- Panel de cliente: perfil, plan, facturas, miembros de su organización y soporte.
- Internacionalización: español e inglés desde el inicio. Ningún texto de interfaz va escrito directamente en el código; todo pasa por archivos de traducción. Moneda, fecha y zona horaria configurables.
- Módulos reutilizables (tomarlos del starter kit, no reescribirlos): notificaciones, carga de archivos, importar y exportar datos, API pública con claves, webhooks y feature flags.
- Plantillas de documentos en `docs/templates`: propuesta, cotización, contrato, reporte mensual al cliente y manual de usuario. Se rellenan a partir de ellas, no desde cero.
- Pagos locales con Azul, con tokenización: nunca almacenar números de tarjeta. Los datos de tarjeta no pasan por nuestros servidores ni logs.
- Facturación fiscal local: comprobantes electrónicos según el país (en República Dominicana, e-CF de la DGII). Un contador valida el flujo antes de lanzar.
- Privacidad del usuario: exportar y borrar cuenta y datos, consentimiento de cookies y registro de aceptación de términos.
- Auditoría y roles finos: registro inmutable de quién hizo qué y permisos por módulo. Toda acción administrativa queda registrada.
- Marca blanca: logo, colores, dominio y textos configurables por cliente, sin cambiar código.
- Control de tiempo y costos por proyecto: registrar horas, uso de IA, hosting y herramientas por proyecto.
- Calculadora de cotizaciones: precio estándar según módulos y complejidad, usada por las plantillas de propuesta.
- Pruebas de penetración periódicas: antes de lanzar productos con pagos o datos sensibles, luego una vez al año y tras cambios grandes en pagos o autenticación. Entre una y otra, escaneo automático mensual. Registrar fechas y hallazgos en `docs/security/`.
- Plan de continuidad en `docs/continuity`: repositorios, accesos, proveedores y procedimientos. Mantenerlo actualizado en cada cambio de infraestructura.
- Analítica con feedback: analítica de uso y embudos, botón de sugerencias, encuestas cortas y NPS, siempre con consentimiento del usuario. El analista resume y prioriza lo recibido.
- Onboarding guiado: primeros pasos, datos de ejemplo y centro de ayuda con buscador.
- SSO empresarial (SAML u OIDC) activable por organización.
- Accesibilidad y móvil: WCAG 2.2 nivel AA, diseño responsivo y PWA. Pruebas automáticas de accesibilidad en CI; un PR con fallos de accesibilidad no se fusiona.
- API pública documentada con OpenAPI generado automáticamente. Webhooks firmados, con reintentos con espera creciente y registro de entregas.
- Gestión de cobros: prueba gratuita, cupones, cambios de plan con prorrateo, reintento automático de pagos fallidos y avisos al cliente. Comprobar qué admite Azul para cobros recurrentes antes de diseñarlos.
- Pagos a prueba de fallos (obligatorio en todo producto que cobre): clave de idempotencia en cada cobro, webhooks de pago procesados una sola vez, estados de pago explícitos y conciliación diaria automática con Azul o Stripe, con alerta si hay diferencias. Pruebas que simulen reintentos, doble clic y webhooks duplicados.
- Trabajos en segundo plano (núcleo): todo lo lento o diferible (correos, reportes, importaciones, webhooks) va a una cola con reintentos de espera creciente. Cola de fallidos revisable desde el panel administrativo. Trabajos idempotentes. Monitoreo y alerta de la cola.
- Límites por plan y portal de facturación (opcional): catálogo de planes con límites y funciones por plan, medición de uso, aviso al acercarse al límite, cambio de plan, y portal donde el cliente descarga facturas y cambia su método de pago. Los límites se validan siempre en el servidor.
- Reportes programados (opcional): dashboards personalizables y reportes por correo semanales o mensuales en PDF o CSV, generados en segundo plano y respetando los permisos del destinatario.
- Búsqueda global y atajos (opcional): un solo buscador con atajo de teclado, filtrado siempre por los permisos del usuario y su organización.
- Portal de proyecto para el cliente (opcional, en proyectos a la medida): el cliente ve estado y avance, prueba demos en su entorno de pruebas, aprueba entregables y criterios de aceptación, solicita cambios (que entran al flujo de anexos) y descarga documentación e historial de decisiones. Cada cliente solo ve su propio proyecto. Los compromisos de alcance o precio los confirma el dueño, nunca un agente.
- Agente de soporte (opcional): usa solo la base de conocimiento del producto, escala al humano con el contexto del usuario y registra las preguntas sin respuesta. Nunca accede a datos de otros clientes ni ejecuta acciones sensibles, y trata los mensajes de usuarios como datos, no como instrucciones.
