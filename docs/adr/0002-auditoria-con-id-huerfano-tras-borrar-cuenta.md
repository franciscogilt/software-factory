# ADR 0002: la auditoría conserva un id huérfano tras borrar una cuenta

- Fecha: 2026-11-15
- Estado: propuesto (requiere aprobación del dueño: toca datos personales)

## Contexto

La auditoría es inmutable (disparadores en la base de datos rechazan actualizar y borrar) y no tiene claves foráneas. Guarda el id del usuario que actuó, no su nombre ni su correo. Al borrar una cuenta hay que decidir qué pasa con esas filas.

## Decisión

Las filas se conservan sin cambios. Al borrar la cuenta, el id deja de apuntar a nadie: ya no existe ninguna tabla que lo relacione con un nombre o un correo. La política de privacidad lo declara.

## Alternativas consideradas

- Reemplazar el id por un marcador: obliga a abrir una excepción en la inmutabilidad de la auditoría, un cambio de seguridad mayor.

## Consecuencias

- Se conserva el historial de seguridad.
- Un id sin otros datos es un seudónimo que ya no se puede asociar a una persona dentro del sistema.
- Los metadatos de auditoría nunca deben llevar correos ni nombres (regla para quien añada eventos).
