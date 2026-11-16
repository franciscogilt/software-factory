# Revisión

Veredicto: cambios

## Alcance
Hace lo pedido: calcula el descuento. Nada extra.

## Calidad
`applyDiscount` no valida que `pct` esté entre 0 y 100.

## Pruebas
No hay ninguna prueba para la lógica de negocio nueva; el mínimo es 80% de cobertura. Faltan casos límite (0, 100, negativo).

## Seguridad
Sin hallazgos en este archivo.
