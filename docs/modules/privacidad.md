# Módulo: privacidad del usuario

Especificación: `docs/specs/privacidad-del-usuario.md`. Decisión sobre la auditoría: `docs/adr/0002-auditoria-con-id-huerfano-tras-borrar-cuenta.md`.

## Qué hace
- **Exportar mis datos** (`/app/privacy/export`): JSON con perfil, proveedores de acceso (sin tokens), membresías, términos aceptados, consentimientos y acciones que la persona realizó. Nunca secretos, hashes ni datos de otros. Límite de 5 por hora, auditado (`privacy.exported`) y medido como flujo `privacy_export`.
- **Eliminar mi cuenta** (`/app/privacy`): confirmación escribiendo el correo (y sesión verificada en dos pasos si la persona tiene 2FA). Termina todas las sesiones, bloquea el acceso a organizaciones y avisa por correo. Se elimina por completo a los 14 días; si inicia sesión antes, solo puede cancelar o cerrar sesión. El único dueño de una organización no puede borrarse hasta transferirla.
- **Borrado definitivo** (`packages/jobs/src/purge.ts`, cada hora en el worker): elimina usuario y todo lo que cuelga de él (cuentas, sesiones, membresías, 2FA, códigos, términos, consentimientos), tokens de enlace, límites por su correo y correos pendientes a su dirección. La auditoría conserva solo el id huérfano. Si la persona quedó como único dueño durante la gracia, el borrado se retiene.
- **Términos**: `lib/terms.ts` define la versión vigente. Quien no la aceptó ve la pantalla de aceptación en todo `/app`. Subir la versión obliga a aceptar de nuevo.
- **Cookies**: aviso informativo (solo cookies esenciales: sesión e idioma). La tabla `consent` y `recordConsent`/`currentConsent` quedan listas para la analítica.
- **Páginas legales** (`/legal/terms`, `/legal/privacy`): borrador que debe revisar un abogado.

## Cómo se prueba
- `packages/db/src/privacy.test.ts` (export sin secretos, único dueño, gracia, cancelación, borrado completo, auditoría sin datos personales, borrado retenido).
- `packages/jobs/src/purge.test.ts` (borrado y un solo correo de despedida).
- e2e `apps/e2e/tests/privacy.spec.ts` (términos, cookies, exportación propia, único dueño, correo que no coincide, ciclo completo de borrado y cancelación, segundo paso) y las pantallas nuevas en `accessibility.spec.ts`.

## Reversión
Migración 0008 aditiva (dos tablas y una columna nueva). Para revertir: quitar el código y luego `DROP TABLE consent, terms_acceptance; ALTER TABLE "user" DROP COLUMN "deletionRequestedAt";`. Antes de un despliegue con cuentas reales, respaldar la base.

## Límites conocidos
- Textos legales en borrador. Falta revisión de un abogado antes de producción.
- La exportación incluye hasta 5.000 acciones de auditoría.
- La puerta de términos es de interfaz; las acciones del servidor se protegen por autorización, no por términos.
- Los correos son bilingües porque aún no se guarda el idioma de cada persona.
- No hay borrado de otra persona por un administrador.
