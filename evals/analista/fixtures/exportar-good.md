# Especificación: exportar reporte de actividad a CSV

- Ticket: eval-exportar
- Producto: demo
- Nivel de riesgo: medio
- Modo: completo

## Problema

El administrador no puede llevarse la actividad de su organización para analizarla fuera.

## Alcance

Incluye: descarga CSV de la actividad con filtro por fecha, solo para roles de administración.
No incluye: PDF ni reportes programados.

## Criterios de aceptación

- Dado un administrador con actividad en el rango, cuando descarga el CSV con fechas válidas, entonces recibe solo filas de su organización.
- Dado un miembro sin rol de administración, cuando pide la descarga, entonces recibe un error de permiso.
- Dado un rango de fechas mayor al máximo, cuando descarga, entonces ve un mensaje que explica el límite.

## Flujo crítico afectado

Ninguno.

## Preguntas abiertas

- ¿Qué columnas debe incluir el archivo?
