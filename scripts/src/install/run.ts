// Installer orchestration. Pure of console and process: everything comes in through `Options`, so tests drive it with fakes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { defaultRunner, type Runner } from '../onboard/checks.ts';
import { detectCase, doctor, MARKER, sanitizeName, type DbMode, type Problem } from './detect.ts';
import { dockerUp, localPrepare, migrate, parseDbUrl } from './database.ts';
import { applyCopy, FACTORY_WRAPPER, listKitFiles, planCopy, productConfig, productReadme, renderEnv, rootLevelFiles, writeIfAbsent, type CopyPlan } from './kit.ts';

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
const readMarker = (target: string): Marker | null => {
  try {
    return JSON.parse(readFileSync(join(target, MARKER), 'utf8')) as Marker;
  } catch {
    return null;
  }
};
const writeMarker = (target: string, m: Marker) => writeFileSync(join(target, MARKER), `${JSON.stringify(m, null, 2)}\n`);

export function bootstrap(o: Options): Report {
  const run = o.run ?? defaultRunner;
  const sleep = o.sleep ?? ((ms) => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms));
  const detected = detectCase(o.target);
  const marker = detected === 'instalada' ? readMarker(o.target) : null;
  const report: Report = { kind: marker?.mode ?? (detected === 'instalada' ? 'existente' : detected), ok: false, dryRun: o.dryRun, problems: [], plan: null, done: [], failed: null, next: [] };
  const fail = (msg: string): Report => ((report.failed = msg), report);

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

  mkdirSync(o.target, { recursive: true });
  applyCopy(o.sourceRoot, o.target, plan);
  report.done.push(`kit copiado: ${plan.copy.length} archivos nuevos${plan.same.length ? `, ${plan.same.length} ya estaban` : ''}${plan.skipped.length ? `, ${plan.skipped.length} conservados sin tocar` : ''}`);
  for (const r of plan.renamed) report.done.push(`${r.from} del proyecto se conservó; la versión de la fábrica quedó en ${r.to} (fusiónalas a mano)`);
  const installedAt = marker?.installedAt ?? new Date().toISOString();
  writeMarker(o.target, { mode: kind, complete: false, version: o.version ?? 'desconocida', db: o.db, installedAt });

  const rootFiles = (o.rootFiles ?? rootLevelFiles)(o.target);
  if (writeIfAbsent(join(o.target, 'product.config.yaml'), productConfig({ kind, name, type: o.type, rootFiles: kind === 'existente' ? rootFiles : [], configuredProfile: null }))) report.done.push('product.config.yaml creado');
  else report.done.push('product.config.yaml ya existía: se conservó');

  if (kind === 'nuevo') {
    // A new product is a new repository; no commit is made (the owner or the first PR does that).
    if (!existsSync(join(o.target, '.git')) && run('git', ['init', '-q', '-b', 'main'], o.target, { ...process.env }, 30_000).status === 0) report.done.push('repositorio git iniciado (sin commits)');
    if (writeIfAbsent(join(o.target, 'README.md'), productReadme(name))) report.done.push('README.md creado');
    for (const d of ['docs/specs', 'docs/lessons', 'docs/security', 'docs/continuity']) writeIfAbsent(join(o.target, d, '.gitkeep'), '');
    const url = o.db === 'docker' ? DEFAULT_URL : (o.databaseUrl ?? process.env.DATABASE_URL ?? `postgres://factory:factory@localhost:5432/${name}`);
    try {
      parseDbUrl(url);
    } catch (e) {
      return fail(`conexión no válida: ${(e as Error).message}`);
    }
    const example = join(o.target, '.env.example');
    if (existsSync(example) && writeIfAbsent(join(o.target, '.env'), renderEnv(readFileSync(example, 'utf8'), url), 0o600)) report.done.push('.env creado con secretos de desarrollo generados al azar (no se muestran)');
    const install = run('pnpm', ['install', '--frozen-lockfile'], o.target, { ...process.env, CI: 'true' }, 900_000);
    if (install.status !== 0) return fail(`pnpm install falló:\n${install.output}`);
    report.done.push('dependencias instaladas');
    const dbOk = step(o.db === 'docker' ? 'base de datos (Docker)' : 'base de datos (local)', () => (o.db === 'docker' ? dockerUp(run, o.target, sleep) : localPrepare(run, o.target, url)));
    if (!dbOk || !step('migraciones', () => migrate(run, o.target, url))) return report;
    report.next = [
      `cd ${o.target}`,
      'pnpm --filter @factory/web dev   # app en http://localhost:3000',
      'Validar el nicho (docs/discovery/) y poner validation: approved en product.config.yaml antes del primer ticket',
    ];
  } else {
    writeIfAbsent(join(o.target, '.factory-state', '.gitignore'), '*\n');
    writeIfAbsent(join(o.target, 'scripts', '.gitignore'), 'node_modules/\n');
    if (writeIfAbsent(join(o.target, 'factory'), FACTORY_WRAPPER, 0o755)) report.done.push('atajo ./factory creado');
    const install = run('pnpm', ['install', '--ignore-workspace'], join(o.target, 'scripts'), { ...process.env, CI: 'true' }, 900_000);
    if (install.status !== 0) return fail(`pnpm install (scripts/) falló:\n${install.output}`);
    report.done.push('herramientas de la fábrica instaladas en scripts/');
    const init = run(join('scripts', 'node_modules', '.bin', 'tsx'), [join('scripts', 'src', 'onboard', 'cli.ts'), 'init', '--path', o.target], o.target, { ...process.env }, 120_000);
    if (init.status !== 0) return fail(`onboard init falló:\n${init.output}`);
    report.done.push('incorporación iniciada (docs/onboarding/)');
    report.next = [
      `cd ${o.target}`,
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
