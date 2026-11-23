// `pnpm run bootstrap -- --target <carpeta> [--db docker|local] [--name x] [--type saas|custom] [--database-url url] [--dry-run] [--force]`
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRunner } from '../onboard/checks.ts';
import { chooseDb, detectCase, type DbMode } from './detect.ts';
import { bootstrap } from './run.ts';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const arg = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const target = resolve(arg('target') ?? process.cwd());
// Default: a folder with nothing is the owner's own SaaS; a project that already exists is treated as custom work.
const type = (arg('type') ?? (detectCase(target) === 'nuevo' ? 'saas' : 'custom')) as 'saas' | 'custom';
if (type !== 'saas' && type !== 'custom') {
  console.error('--type debe ser saas o custom');
  process.exit(2);
}

let db = arg('db') as DbMode | undefined;
if (db !== undefined && db !== 'docker' && db !== 'local') {
  console.error('--db debe ser docker o local');
  process.exit(2);
}
const auto = chooseDb(defaultRunner);
// Only a brand-new product needs a database; ask when there is a terminal, otherwise take the detected default.
if (!db && detectCase(target) === 'nuevo' && process.stdin.isTTY && !flag('yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Base de datos para desarrollo: 1) Docker  2) PostgreSQL instalado en esta máquina [${auto === 'docker' ? 1 : 2}]: `)).trim();
  rl.close();
  db = answer === '1' ? 'docker' : answer === '2' ? 'local' : auto;
}
db ??= auto;

let version = 'desconocida';
try {
  version = execFileSync('git', ['-C', sourceRoot, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // not a git checkout
}

const report = bootstrap({ target, sourceRoot, db, name: arg('name'), type, databaseUrl: arg('database-url'), dryRun: flag('dry-run'), force: flag('force'), version });

console.log(`Destino: ${target}\nCaso: ${report.kind === 'nuevo' ? 'producto nuevo' : 'proyecto existente'}${report.dryRun ? ' (simulación: no se escribe nada)' : ''}\nBase de datos: ${report.kind === 'nuevo' ? db : 'no aplica (proyecto existente)'}`);
for (const p of report.problems) console.log(`✘ Falta ${p.tool}: ${p.why}\n    Cómo instalarlo: ${p.fix}`);
if (report.plan) {
  const { plan } = report;
  console.log(`Archivos: ${plan.copy.length} se crearían/crearon, ${plan.same.length} ya iguales, ${plan.renamed.length} con versión .factory.md, ${plan.skipped.length} conservados sin tocar.`);
  if (report.dryRun) for (const f of plan.copy.slice(0, 15)) console.log(`  + ${f.to}`);
  for (const f of plan.skipped.slice(0, 15)) console.log(`  = ${f} (ya existe y es distinto: no se toca)`);
}
for (const d of report.done) console.log(`✓ ${d}`);
if (report.failed) {
  console.error(`\n✘ ${report.failed}${report.done.length ? '\nEs seguro volver a correr el instalador: no sobrescribe nada y retoma donde quedó.' : ''}`);
  process.exit(1);
}
if (report.dryRun) process.exit(report.ok ? 0 : 1);
console.log('\nListo. Siguientes pasos:');
for (const n of report.next) console.log(`  - ${n}`);
