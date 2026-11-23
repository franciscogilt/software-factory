// Installer orchestration. Pure of console and process: everything comes in through `Options`, so tests drive it with fakes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { defaultRunner, type Runner } from '../onboard/checks.ts';
import { detectCase, doctor, MARKER, overlapsSource, sanitizeName, type DbMode, type Problem } from './detect.ts';
import { dockerUp, isLocalHost, localPrepare, migrate, parseDbUrl } from './database.ts';
import { applyCopy, FACTORY_WRAPPER, listKitFiles, planCopy, productConfig, productReadme, renderEnv, installEnv, isSafePath, lexists, rootLevelFiles, writeIfAbsent, type CopyPlan } from './kit.ts';

export interface Options {
  target: string;
  sourceRoot: string;
  db: DbMode;
  name?: string;
  type: 'saas' | 'custom';
  databaseUrl?: string;
  dryRun: boolean;
  force: boolean;
  run?: Runner;
  sleep?: (ms: number) => void;
  platform?: string;
  nodeVersion?: string;
  version?: string;
  rootFiles?: (target: string) => string[];
}

export interface Report {
  kind: 'nuevo' | 'existente';
  ok: boolean;
  dryRun: boolean;
  problems: Problem[];
  plan: CopyPlan | null;
  done: string[];
  failed: string | null;
  next: string[];
}

interface Marker {
  mode: 'nuevo' | 'existente';
  complete: boolean;
  version: string;
  db: DbMode;
  installedAt: string;
}

const DEFAULT_URL = 'postgres://factory:factory@localhost:5432/factory';
// null = no marker; 'corrupt' = a marker that cannot be read (never guess the case from the folder contents then).
const readMarker = (target: string): Marker | 'corrupt' | null => {
  if (!lexists(join(target, MARKER))) return null;
  try {
    if (!isSafePath(target, MARKER)) return 'corrupt';
    const m = JSON.parse(readFileSync(join(target, MARKER), 'utf8')) as Marker;
    return (m.mode === 'nuevo' || m.mode === 'existente') && typeof m.complete === 'boolean' ? m : 'corrupt';
  } catch {
    return 'corrupt';
  }
};
const writeMarker = (target: string, m: Marker) => {
  if (!isSafePath(target, MARKER)) throw new Error(`${MARKER} es un enlace simbólico: se rechaza`);
  writeFileSync(join(target, MARKER), `${JSON.stringify(m, null, 2)}\n`);
};

export function bootstrap(o: Options): Report {
  const run = o.run ?? defaultRunner;
  const sleep = o.sleep ?? ((ms) => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms));
  const detected = detectCase(o.target);
  const found = detected === 'instalada' ? readMarker(o.target) : null;
  const marker = found === 'corrupt' ? null : found;
  const report: Report = { kind: marker?.mode ?? (detected === 'instalada' ? 'existente' : detected), ok: false, dryRun: o.dryRun, problems: [], plan: null, done: [], failed: null, next: [] };
  const fail = (msg: string): Report => ((report.failed = msg), report);

  if (overlapsSource(o.target, o.sourceRoot)) return fail('el destino coincide con la carpeta de la fábrica o la contiene/está dentro de ella: elige otra carpeta');
  if (found === 'corrupt') return fail(`${MARKER} no se puede leer: revísalo o bórralo (si borras el marcador, el instalador volverá a deducir el caso por el contenido de la carpeta)`);
  // An unfinished earlier run resumes by itself; a finished one is refused unless --force (which only adds what is missing).
  if (detected === 'instalada' && marker?.complete && !o.force) return fail('la fábrica ya está instalada aquí (usa --force para añadir solo lo que falte, sin sobrescribir)');
  const kind = report.kind;

  report.problems = doctor({ case: kind, db: o.db, run, platform: o.platform, nodeVersion: o.nodeVersion });
  if (report.problems.length > 0 && !o.dryRun) return fail(`faltan herramientas: ${report.problems.map((p) => p.tool).join(', ')}`);

  const files = listKitFiles(o.sourceRoot, kind);
  const plan = planCopy(o.sourceRoot, o.target, files);
  report.plan = plan;
  if (kind === 'existente' && plan.skipped.some((f) => f === 'scripts/package.json')) {
    return fail('tu proyecto ya tiene scripts/package.json distinto al de la fábrica: muévelo o renómbralo y vuelve a correr el instalador (no se copió nada)');
  }
  if (o.dryRun) {
    report.done = kind === 'nuevo'
      ? ['crearía el kit completo', 'git init', 'product.config.yaml, README.md y .env (secretos al azar)', 'pnpm install --frozen-lockfile', o.db === 'docker' ? 'docker compose up -d db mail' : 'crear la base de datos local si falta', 'migraciones']
      : ['añadiría las piezas de la fábrica (sin tocar tus archivos)', 'product.config.yaml con el stack detectado', 'atajo ./factory', 'pnpm install --ignore-workspace (en scripts/)', 'onboard init'];
    report.ok = report.problems.length === 0;
    return report;
  }

  const name = sanitizeName(o.name ?? basename(o.target));
  const step = (label: string, fn: () => { ok: boolean; message: string }): boolean => {
    const r = fn();
    if (r.ok) report.done.push(`${label}: ${r.message}`);
    else report.failed = `${label}: ${r.message}`;
    return r.ok;
  };

  // Everything that can be validated is validated before the first byte is written.
  const url = o.db === 'docker' ? DEFAULT_URL : (o.databaseUrl ?? `postgres://factory:factory@localhost:5432/${name}`);
  if (kind === 'nuevo') {
    try {
      if (!isLocalHost(parseDbUrl(url).host)) return fail('el instalador solo prepara bases de datos en esta máquina (localhost); para un servidor remoto crea la base a mano y pon su DATABASE_URL en .env');
    } catch (e) {
      return fail(`conexión no válida: ${(e as Error).message}`);
    }
  }
  const hadScripts = existsSync(join(o.target, 'scripts')); // before the copy creates it
  mkdirSync(o.target, { recursive: true });
  // The marker goes first: if the process dies mid-copy, the retry still knows which case this was.
  const installedAt = marker?.installedAt ?? new Date().toISOString();
  writeMarker(o.target, { mode: kind, complete: false, version: o.version ?? 'desconocida', db: o.db, installedAt });
  applyCopy(o.sourceRoot, o.target, plan);
  report.done.push(`kit copiado: ${plan.copy.length} archivos nuevos${plan.same.length ? `, ${plan.same.length} ya estaban` : ''}${plan.skipped.length ? `, ${plan.skipped.length} conservados sin tocar` : ''}`);
  for (const r of plan.renamed) report.done.push(`${r.from} del proyecto se conservó; la versión de la fábrica quedó en ${r.to} (fusiónalas a mano)`);

  const rootFiles = (o.rootFiles ?? rootLevelFiles)(o.target);
  if (writeIfAbsent(o.target, 'product.config.yaml', productConfig({ kind, name, type: o.type, rootFiles: kind === 'existente' ? rootFiles : [], configuredProfile: null }))) report.done.push('product.config.yaml creado');
  else report.done.push('product.config.yaml ya existía: se conservó (revisa que tenga origin, stack_profile y commands: si es un proyecto existente)');
  if (kind === 'existente' && hadScripts && plan.copy.some((c) => c.to.startsWith('scripts/')) && !marker) report.done.push('aviso: tu proyecto ya tenía una carpeta scripts/; los archivos de la fábrica se añadieron junto a los tuyos');

  if (kind === 'nuevo') {
    // A new product is a new repository; no commit is made (the owner or the first PR does that).
    const insideRepo = run('git', ['rev-parse', '--is-inside-work-tree'], o.target, installEnv(), 30_000).status === 0; // never nest a repository
    if (!existsSync(join(o.target, '.git')) && !insideRepo && run('git', ['init', '-q', '-b', 'main'], o.target, installEnv(), 30_000).status === 0) report.done.push('repositorio git iniciado (sin commits)');
    else if (insideRepo && !existsSync(join(o.target, '.git'))) report.done.push('aviso: la carpeta ya está dentro de otro repositorio git: no se creó uno nuevo');
    if (o.db === 'docker' && o.databaseUrl) report.done.push('aviso: --database-url se ignora en modo docker (se usa la base del compose)');
    if (writeIfAbsent(o.target, 'README.md', productReadme(name))) report.done.push('README.md creado');
    for (const d of ['docs/specs', 'docs/lessons', 'docs/security', 'docs/continuity']) writeIfAbsent(o.target, `${d}/.gitkeep`, '');
    const example = join(o.target, '.env.example');
    if (existsSync(example) && writeIfAbsent(o.target, '.env', renderEnv(readFileSync(example, 'utf8'), url), 0o600)) report.done.push('.env creado con secretos de desarrollo generados al azar (no se muestran)');
    else if (existsSync(join(o.target, '.env'))) report.done.push('.env ya existía: se conservó (su DATABASE_URL puede no coincidir con la de esta ejecución)');
    const install = run('pnpm', ['install', '--frozen-lockfile'], o.target, { ...installEnv(), CI: 'true' }, 900_000);
    if (install.status !== 0) return fail(`pnpm install falló:\n${install.output}`);
    report.done.push('dependencias instaladas');
    const dbOk = step(o.db === 'docker' ? 'base de datos (Docker)' : 'base de datos (local)', () => (o.db === 'docker' ? dockerUp(run, o.target, sleep) : localPrepare(run, o.target, url)));
    if (!dbOk || !step('migraciones', () => migrate(run, o.target, url))) return report;
    report.next = [
      `cd '${o.target.replace(/'/g, "'\\''")}'`,
      'pnpm --filter @factory/web dev   # app en http://localhost:3000',
      'Validar el nicho (docs/discovery/) y poner validation: approved en product.config.yaml antes del primer ticket',
    ];
  } else {
    writeIfAbsent(o.target, '.factory-state/.gitignore', '*\n');
    writeIfAbsent(o.target, 'scripts/.gitignore', 'node_modules/\n');
    if (writeIfAbsent(o.target, 'factory', FACTORY_WRAPPER, 0o755)) report.done.push('atajo ./factory creado');
    const install = run('pnpm', ['install', '--ignore-workspace', '--frozen-lockfile'], join(o.target, 'scripts'), { ...installEnv(), CI: 'true' }, 900_000);
    if (install.status !== 0) return fail(`pnpm install (scripts/) falló:\n${install.output}`);
    report.done.push('herramientas de la fábrica instaladas en scripts/');
    const init = run(join('scripts', 'node_modules', '.bin', 'tsx'), [join('scripts', 'src', 'onboard', 'cli.ts'), 'init', '--path', o.target], o.target, installEnv(), 120_000);
    if (init.status !== 0) return fail(`onboard init falló:\n${init.output}`);
    report.done.push('incorporación iniciada (docs/onboarding/)');
    report.next = [
      `cd '${o.target.replace(/'/g, "'\\''")}'`,
      'Revisar commands: en product.config.yaml (son valores por defecto del stack detectado)',
      'git checkout -b chore/instalar-fabrica && git add -A && git commit y abrir un PR (es nivel alto: lo apruebas tú)',
      './factory onboard check   # instala, prueba y mide cobertura del proyecto (mejor en un contenedor desechable si el proyecto no es tuyo)',
      'Después, el arquitecto escribe docs/onboarding/map.md y el tester las pruebas de caracterización; ./factory onboard gate cierra la incorporación',
    ];
  }
  writeMarker(o.target, { mode: kind, complete: true, version: o.version ?? 'desconocida', db: o.db, installedAt });
  report.ok = true;
  return report;
}
