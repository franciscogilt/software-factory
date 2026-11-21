# Stack y configuración por producto

Léelo al iniciar un producto o al tocar tecnologías.

## Stack por defecto

Este es el stack recomendado, no una imposición: el dueño puede cambiar cualquier tecnología (ver «Configuración por producto»).

- Next.js con TypeScript en modo estricto.
- PostgreSQL con migraciones versionadas (Prisma o Drizzle).
- Autenticación con Auth.js o Clerk. Nunca programar login, hash de contraseñas ni sesiones a mano.
- Microsoft (OAuth) es un inicio de sesión opcional que se activa por producto mediante configuración, sin cambiar código.
- Todo producto incluye inicio de sesión con Google (OAuth) además de correo y contraseña. Vincular cuentas por correo verificado, pedir solo los permisos mínimos (perfil y correo) y guardar las credenciales de Google en variables de entorno, nunca en el código.
- Pagos con Azul (local) y Stripe (internacional) detrás de una capa de pagos con proveedor intercambiable. Correo con Resend o Postmark.
- Pruebas con Vitest (unitarias e integración) y Playwright (extremo a extremo).
- CI/CD con GitHub Actions. Errores con Sentry.
- No añadir librerías nuevas sin justificarlo en el PR (qué problema resuelve, mantenimiento, licencia y tamaño).

## Configuración por producto

- Cada producto tiene un `product.config.yaml` en su raíz. Es la fuente de verdad: leerlo antes de trabajar. No añadir módulos ni cambiar el stack sin actualizarlo y sin aprobación del dueño.
- Al iniciar un producto nuevo, el gerente hace al dueño un cuestionario corto con una recomendación por pregunta y guarda las respuestas en el archivo. No asumir valores que el dueño no confirmó.
- Revisión del stack: el gerente muestra el stack completo recomendado, tecnología por tecnología (frontend, backend, base de datos, autenticación, pagos, correo, archivos, cola, pruebas, nube y monitoreo), con el motivo de cada elección, y pregunta siempre al dueño si quiere cambiar alguna antes de empezar. Solo se cambia lo que el dueño decide. Para cada cambio, el arquitecto explica el impacto (mantenimiento, costo, compatibilidad con el núcleo y los módulos) y registra un ADR.
- Núcleo (siempre incluido, no se puede desactivar): inicio de sesión con correo y Google, roles y permisos, verificación en dos pasos, panel administrativo con reportes y dashboards, auditoría y privacidad del usuario, cabeceras de seguridad y límites de intentos de inicio de sesión, español e inglés, correos base, accesibilidad, diseño responsivo, estados vacíos y mensajes de error útiles, pruebas, CI/CD, escaneos de seguridad, monitoreo con alertas por flujo crítico, respaldos, cola de trabajos en segundo plano con reintentos y documentación.
- Todo lo demás del catálogo de abajo es opcional y se activa solo si `product.config.yaml` lo indica.
- Decisiones que varían por producto: tipo (SaaS propio o a la medida), stack, gestor de trabajo (GitHub Issues, Azure DevOps, Jira u otro), hosting y región de datos, país y mercado, pagos y precios, tipo de datos (normales, personales o sensibles), marca (propia o marca blanca), nivel de autonomía de agentes y presupuesto y plazo.
- El stack por defecto es el oficial. Si el producto usa otro, el arquitecto genera un kit equivalente que cumpla las mismas reglas del núcleo, de seguridad, de pruebas y de CI, pasa las mismas evaluaciones y registra un ADR que justifique la elección.
- Otro stack sin kit propio: el producto declara `stack_profile` y `commands:` en `product.config.yaml` (instalar, compilar, tipos, linter, pruebas, cobertura). Las puertas y la incorporación usan esos comandos; el flujo, los agentes y los niveles de riesgo son los mismos. Detalle en `docs/modules/comandos-por-proyecto.md`.
- Los límites de costo y tiempo de cada producto se definen en este archivo de configuración y se aplican según la sección de robustez.
