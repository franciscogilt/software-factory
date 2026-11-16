# Flujo: incorporar un proyecto existente

Cuándo usarlo: antes del primer ticket de cualquier proyecto que ya existe (de un cliente o del dueño). Trabajo en un contenedor desechable.

1. `onboard init --path <proyecto>` y poner `origin: existing` en su `product.config.yaml`.
2. Arquitecto: escribe `docs/onboarding/map.md`. `check-output --role arquitecto` lo valida.
3. Tester: pruebas de caracterización de cada flujo crítico y `safety-net.json`.
4. `onboard check` y `onboard gate`. Si falla, el trabajo pendiente se dice en la salida; si el proyecto no corre, eso es el primer trabajo.
5. Con la puerta en verde el estado es `completo` y `factory intake` acepta tickets. Se sigue con las convenciones del proyecto, no las del starter kit, y se mantiene el mapa al día.

Detalle: `docs/modules/incorporacion.md`.
