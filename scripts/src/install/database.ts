// Database preparation for a new product. Docker mode starts the compose services; local mode uses a Postgres the owner already has.
import type { Runner } from '../onboard/checks.ts';

export interface DbUrl {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

export function parseDbUrl(url: string): DbUrl {
  const u = new URL(url);
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new Error('DATABASE_URL debe empezar con postgres:// o postgresql://');
  const database = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!/^[A-Za-z0-9_]{1,63}$/.test(database)) throw new Error('el nombre de la base de datos solo puede llevar letras, números y _ (máx. 63)');
  return { host: u.hostname || 'localhost', port: u.port || '5432', user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database };
}

// Credentials travel in PG* variables, never as command arguments (arguments show up in process lists).
const pgEnv = (d: DbUrl, database: string): NodeJS.ProcessEnv => ({ PATH: process.env.PATH, HOME: process.env.HOME, PGHOST: d.host, PGPORT: d.port, PGUSER: d.user, PGPASSWORD: d.password, PGDATABASE: database, PGCONNECT_TIMEOUT: '10' });

export const COMPOSE_FILES = ['-f', 'infra/docker-compose.yml', '-f', 'infra/docker-compose.dev.yml'];

export interface StepResult {
  ok: boolean;
  message: string;
}

export function dockerUp(run: Runner, cwd: string, sleep: (ms: number) => void, waitMs = 90_000): StepResult {
  const env = { ...process.env };
  const up = run('docker', ['compose', ...COMPOSE_FILES, 'up', '-d', 'db', 'mail'], cwd, env, 300_000);
  if (up.status !== 0) return { ok: false, message: `docker compose up falló:\n${up.output}` };
  for (let waited = 0; waited <= waitMs; waited += 3000) {
    if (run('docker', ['compose', ...COMPOSE_FILES, 'exec', '-T', 'db', 'pg_isready', '-U', 'factory'], cwd, env, 15_000).status === 0) return { ok: true, message: 'Postgres en Docker listo (puerto 5432, correo de prueba en http://localhost:8025)' };
    sleep(3000);
  }
  return { ok: false, message: `Postgres en Docker no estuvo listo en ${waitMs / 1000}s: revisa «docker compose ${COMPOSE_FILES.join(' ')} logs db»` };
}

const connectHelp = (d: DbUrl) =>
  `Comprueba que PostgreSQL esté encendido en ${d.host}:${d.port} y que el usuario «${d.user}» exista. Para crearlo (como administrador de Postgres):\n  CREATE ROLE ${d.user} LOGIN PASSWORD '<tu clave>' CREATEDB;\nLuego pasa la conexión con --database-url o la variable DATABASE_URL.`;

export function localPrepare(run: Runner, cwd: string, url: string): StepResult {
  const d = parseDbUrl(url);
  const psql = (database: string, sql: string) => run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], cwd, pgEnv(d, database), 30_000);
  // Connect to the maintenance database first: the product database may not exist yet.
  const probe = psql('postgres', 'select 1');
  if (probe.status !== 0) return { ok: false, message: `no se pudo conectar a PostgreSQL:\n${probe.output}\n${connectHelp(d)}` };
  const exists = psql('postgres', `select 1 from pg_database where datname = '${d.database}'`);
  if (exists.status !== 0) return { ok: false, message: `no se pudo consultar las bases de datos:\n${exists.output}` };
  if (exists.output.trim() === '1') return { ok: true, message: `la base de datos «${d.database}» ya existe` };
  const created = psql('postgres', `create database "${d.database}"`);
  if (created.status !== 0) return { ok: false, message: `no se pudo crear la base «${d.database}» (el usuario necesita CREATEDB):\n${created.output}` };
  return { ok: true, message: `base de datos «${d.database}» creada` };
}

export function migrate(run: Runner, cwd: string, url: string): StepResult {
  const r = run('pnpm', ['--filter', '@factory/db', 'migrate'], cwd, { ...process.env, DATABASE_URL: url }, 300_000);
  return r.status === 0 ? { ok: true, message: 'migraciones aplicadas' } : { ok: false, message: `las migraciones fallaron:\n${r.output}` };
}
