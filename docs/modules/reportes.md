# Módulo: reportes y dashboards del panel

## Qué hace
Página `/app/org/[id]/reports` con indicadores de la organización en un periodo y exportación a CSV y PDF. Solo administradores y dueños con sesión verificada en dos pasos.

- Indicadores: miembros (total, nuevos, por rol, con 2FA), acciones registradas, trabajos del periodo y fallidos.
- Gráficas: actividad por día (zona horaria `APP_TIMEZONE`) y acciones más frecuentes, como tablas con barras (accesibles, sin librería de gráficos).
- Filtros: Desde/Hasta. Sin filtros, últimos 30 días. Rango invertido se corrige; máximo un año.
- Exportaciones: `resumen`, `miembros`, `actividad`, cada una en CSV y PDF (`/reports/export?kind=…&format=…&from=…&to=…`), hasta 10.000 filas.

## Cómo se usa
- Consultas: `packages/db/src/reports.ts` (`orgReport`, `exportMembers`, `exportActivity`). Todas filtran primero por organización.
- CSV: `lib/csv.ts` (BOM UTF-8, CRLF, y neutraliza fórmulas `= + - @` para que Excel no las ejecute).
- PDF: `lib/pdf.ts` con `pdf-lib` (MIT, sin binarios). Fuente estándar Latin-1; otros caracteres salen como `?`.
- Cada exportación: límite de 20 por usuario cada 10 min, entrada `report.exported` en la auditoría y métrica del flujo `export`.

## Cómo se prueba
- `packages/db/src/reports.test.ts`: conteos, zona horaria, rango, aislamiento entre organizaciones.
- `apps/web/src/lib/reports.test.ts`: CSV (incluida inyección de fórmulas), fechas y PDF multipágina.
- e2e `apps/e2e/tests/reports.spec.ts`: panel, descargas CSV/PDF, auditoría, y rechazo a miembros, otra organización, anónimos y entradas inválidas.

## Límites conocidos
- Aún no hay ingresos, planes ni facturas: llegan con el módulo de pagos.
- `audit_log` no tiene índice por (organización, fecha); con mucho volumen habrá que añadirlo (migración, nivel alto).
- Exportación síncrona con tope de filas; las muy grandes irán a la cola de trabajos.
- Reportes programados por correo: módulo opcional aparte.
