# ADR 0001: inicio de sesión con enlace por correo y Google, sin contraseñas propias

- Fecha: 2026-11-15
- Estado: propuesto (requiere aprobación del dueño: toca autenticación)

## Contexto

Las reglas piden inicio de sesión con correo y Google, y prohíben programar a mano contraseñas, hash y sesiones. Auth.js solo recomienda el proveedor de credenciales (correo y contraseña) con precaución, porque obliga a gestionar el hash y los reinicios de contraseña en código propio.

## Decisión

Ofrecer Google y un enlace de acceso enviado por correo (Auth.js, proveedor de correo). Sesiones en base de datos. Vincular cuentas por correo verificado solo para Google.

## Alternativas consideradas

- Correo y contraseña con credenciales de Auth.js: obliga a escribir el hash y la recuperación a mano.
- Un proveedor gestionado (Clerk): menos código, pero dependencia de un tercero de pago.

## Consecuencias

- No hay contraseñas que filtrar.
- El inicio de sesión depende de que el correo funcione (cola de correos y monitoreo).
- Si el dueño quiere contraseñas, se evalúa Clerk o credenciales con revisión de seguridad.
