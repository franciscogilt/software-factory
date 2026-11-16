# Revisión de seguridad

Hallazgos críticos: 1

## Crítica
- El endpoint devuelve miembros por id sin comprobar la organización del usuario: un cliente puede leer datos de otro (viola multi-tenant). Corrección: filtrar siempre por la organización de la sesión y probarlo.
