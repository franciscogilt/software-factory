# Módulo: respaldos y escaneos de seguridad

## Respaldos (`infra/backup/`)
- `backup.sh`: `pg_dump` en formato custom, comprueba que el volcado se puede leer, escribe su suma de verificación, copia opcionalmente fuera del servidor (`BACKUP_S3_URI`, cualquier almacenamiento compatible con S3) y borra los de más de `BACKUP_RETENTION_DAYS` (14 por defecto). Nunca borra el más reciente.
- `restore-check.sh`: verifica la suma, restaura en una base temporal y compara las filas de **todas** las tablas con la base de origen. Falla si algo difiere. Siempre borra la base temporal.
- `run-daily.sh` (servicio `backup` de `docker-compose.yml`): un respaldo y una restauración de prueba al día a las 06:00 UTC. Su healthcheck se pone en rojo si el último respaldo exitoso tiene más de 26 horas.
- `test.sh`: autoprueba contra PostgreSQL real, la ejecuta CI en cada PR. Prueba que un respaldo bueno pasa y que uno malo se detecta: datos distintos, archivo alterado, base inalcanzable, copias antiguas, health check vencido y que no quedan bases temporales.

### Restaurar de verdad (emergencia)
1. Parar la aplicación y el worker.
2. `pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" /backups/factory-AAAAMMDDTHHMMSSZ.dump`
3. Ejecutar la migración (`pnpm --filter @factory/db migrate`) si el respaldo es anterior a la última versión.
4. Levantar la aplicación y comprobar `/api/health/ready`.
Quien restaura en producción necesita aprobación del dueño (nivel alto). Practicar este procedimiento en staging.

### Límite importante
Un respaldo en el mismo disco que la base no protege contra la pérdida del servidor. En cada despliegue real hay que configurar `BACKUP_S3_URI` (con sus credenciales como variables de entorno del servicio) o montar el volumen `backups` en otro almacenamiento. Es una decisión de infraestructura (nivel alto) que se toma por producto.

## Escaneos (`.github/workflows/security.yml`)
- **Dependencias**: `pnpm audit --prod`; bloquea vulnerabilidades altas y críticas; el resto se muestra en el registro.
- **Licencias**: `scripts/check-licenses.mjs` bloquea licencias no aprobadas; las excepciones están escritas con su motivo.
- **Secretos**: gitleaks sobre todo el historial.
- **Imágenes**: Trivy (altas y críticas con arreglo disponible) sobre web, migración, worker y respaldo, y SBOM CycloneDX de cada una como artefacto.
- Se ejecuta en cada PR, en cada fusión y **cada lunes**, porque aparecen avisos nuevos sin cambios de código.
- **Dependabot** (`.github/dependabot.yml`): actualizaciones semanales de npm (agrupadas), acciones y Docker.

### Plazos para corregir (sugeridos)
Crítica 24 horas, alta 7 días, media 30 días. Hoy el escaneo semanal avisa fallando; los tickets automáticos con plazo llegan con la fábrica de agentes.

## Límites conocidos
- El escaneo de imágenes ignora vulnerabilidades sin arreglo publicado.
- `next-auth` declara nodemailer 7 u 8 como peer; usamos 10 porque las versiones anteriores tienen avisos de seguridad y el código de Auth.js no usa ese módulo (enviamos los correos nosotros).
- Se fuerza `postcss` ≥ 8.5.33 con un override de pnpm porque `next` fija una versión vulnerable; quitar el override cuando `next` la actualice.
- Para que estas comprobaciones bloqueen fusiones, `security` y `backup` deben figurar como obligatorias en la protección de rama.
