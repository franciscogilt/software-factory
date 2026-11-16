# Mapa del proyecto

## Cómo correrlo
`pnpm install`, copiar `.env.example` a `.env` y `pnpm dev`. Necesita PostgreSQL y una clave de prueba de Stripe.

## Arquitectura
Aplicación Next.js (rutas en `src/app`) con una base PostgreSQL accedida por Prisma. Los cobros pasan por `src/lib/payments/stripe.ts`.

## Módulos
`src/lib/auth.ts` (sesiones propias), `src/lib/payments` (cobros), `src/app/admin` (panel).

## Convenciones
Archivos en inglés, componentes en PascalCase, funciones de servidor en `src/lib`. No hay carpeta de pruebas.

## Dependencias
next 14, prisma, stripe. Next 14 tiene versión mayor más nueva; sin actualizar desde hace más de un año.

## Deudas
La autenticación propia guarda sesiones sin rotación y no tiene pruebas. Los cobros no tienen clave de idempotencia ni pruebas.

## Flujos críticos
Inicio de sesión (`src/lib/auth.ts`), cobro con Stripe (`src/lib/payments/stripe.ts`) y panel de pedidos (`src/app/admin/orders`).
