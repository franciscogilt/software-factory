# Seguridad (no negociable)

Reglas completas de seguridad. Un resumen vive en CLAUDE.md.

## Seguridad (no negociable)

- Nunca escribir secretos, claves ni tokens en el código ni en el repositorio. Usar variables de entorno y el gestor de secretos del hosting.
- Autorización comprobada en el servidor en cada endpoint, siempre filtrando por organización (multi-tenant): un cliente nunca puede ver datos de otro.
- Consultas a base de datos parametrizadas. Escapar toda salida para evitar XSS. Protección CSRF y límites de tasa en endpoints sensibles.
- Contraseñas y sesiones solo mediante el proveedor de autenticación.
- Verificación en dos pasos obligatoria para roles de administración y opcional para el resto. Gestión de sesiones y dispositivos visible para el usuario.
- Cabeceras HTTP de seguridad (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy) activas y verificadas en CI.
- Límite de intentos de inicio de sesión y de recuperación de contraseña, con bloqueo temporal progresivo y aviso al usuario.
- Datos sintéticos en pruebas: los entornos de prueba, staging y demostración usan solo datos sintéticos realistas, generados por un script en `packages/db/seed`. Nunca copiar datos reales de producción a otros entornos; para reproducir un error, usar una copia anonimizada. Un escaneo en CI busca patrones de datos personales reales en los archivos de prueba.
- Datos personales: guardar el mínimo necesario, cifrar en tránsito y en reposo, y no registrarlos en logs.
- Dependencias: mantener actualizadas y revisar alertas de Dependabot.
- Los agentes no tienen acceso a claves de producción. Los despliegues a producción los aprueba una persona.
