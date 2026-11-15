# Especificación: privacidad del usuario

- Ticket: decisión del dueño (selección múltiple, 2026-11-15)
- Producto: starter kit (núcleo)
- Nivel de riesgo: alto (datos personales, autenticación, migración)
- Modo: completo

## Decisiones del dueño

- Borrado con gracia de 14 días, cancelable.
- Único dueño de una organización: se bloquea el borrado hasta transferir la propiedad.
- Auditoría inmutable: el id del usuario queda huérfano (sin nombre ni correo). Ver ADR 0002.
- Cookies y términos: aviso informativo, registro de consentimiento listo para la analítica y aceptación de términos con versión.

## Alcance

Incluye: exportar mis datos (JSON); solicitar, ver y cancelar el borrado de mi cuenta; borrado definitivo automático al vencer la gracia; aceptación versionada de términos; aviso de cookies; tabla y funciones de consentimiento; páginas de términos y privacidad (borrador).
No incluye: interfaz de consentimiento de analítica (no hay analítica todavía); texto legal definitivo (lo revisa un abogado); borrado por un administrador a nombre de otro usuario.

## Criterios de aceptación

- Dado un usuario con sesión, cuando descarga sus datos, entonces recibe un JSON con su perfil, proveedores (sin tokens), membresías, aceptaciones, consentimientos y las acciones de auditoría que él realizó, y nunca secretos, hashes ni datos de otros.
- Dado un usuario que es el único dueño de una organización, cuando pide borrar su cuenta, entonces se rechaza y se le indica qué organizaciones debe transferir.
- Dado un usuario que pide borrar su cuenta, entonces sus sesiones terminan, queda marcado con fecha, no puede usar ninguna organización y recibe un correo con la fecha de borrado.
- Dado un usuario con borrado pendiente, cuando inicia sesión, entonces solo ve la pantalla para cancelar o cerrar sesión; al cancelar recupera el acceso.
- Dado un borrado vencido (14 días), cuando corre el trabajo periódico, entonces se eliminan usuario, cuentas, sesiones, membresías, 2FA, códigos, aceptaciones, consentimientos, tokens de enlace, límites por su correo y correos pendientes a su dirección; la auditoría conserva solo el id.
- Dado un usuario que no ha aceptado la versión vigente de los términos, cuando entra a la aplicación, entonces debe aceptarlos antes de continuar; se guarda versión y fecha.
- Dado un visitante sin aviso previo, entonces ve el aviso de cookies esenciales hasta que lo cierra.
- Toda exportación, solicitud, cancelación y borrado queda en la auditoría.

## Flujo crítico afectado

Inicio de sesión (la puerta de términos y de borrado pendiente) y exportación (se mide como flujo `privacy_export`).

## Preguntas abiertas

- Texto legal de términos y política de privacidad: lo revisa un abogado antes de producción.
- Plazo de retención de la auditoría: sin límite por ahora.
