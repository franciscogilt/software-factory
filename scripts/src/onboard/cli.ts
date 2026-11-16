// Onboarding CLI for existing projects: scan, init, check, gate. Always acts on --path (default: the current repository).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { measureCoverage, runChecks, type CheckResult } from './checks.ts';
import { evaluateSafetyNet, ONBOARDING_DIR, readJsonFile, type OnboardingState, type SafetyNet } from './gate.ts';
import { scanProject } from './scan.ts';

const [cmd, ...rest] = process.argv.slice(2);
const arg = (n: string) => {
  const i = rest.indexOf(`--${n}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const root = resolve(arg('path') ?? process.cwd());
const dir = join(root, ONBOARDING_DIR);
const write = (name: string, data: unknown) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`);
};

if (cmd === 'scan') {
  const profile = scanProject(root);
  write('profile.json', profile);
  console.log(JSON.stringify(profile, null, 2));
} else if (cmd === 'init') {
  const profile = scanProject(root);
  if (!existsSync(join(dir, 'state.json'))) write('state.json', { status: 'pendiente' } satisfies OnboardingState);
  if (!existsSync(join(dir, 'safety-net.json'))) {
    write('safety-net.json', { flows: Object.fromEntries(Object.keys(profile.criticalCandidates).map((f) => [f, []])) } satisfies SafetyNet);
  }
  write('profile.json', profile);
  console.log(`Incorporación iniciada en ${ONBOARDING_DIR}: estado pendiente.\nCandidatos a flujos críticos: ${Object.keys(profile.criticalCandidates).join(', ') || 'ninguno detectado'}.\nSiguiente: el arquitecto escribe map.md; el tester escribe pruebas de caracterización y las lista en safety-net.json (borrar los flujos que no apliquen).`);
} else if (cmd === 'check') {
  const profile = scanProject(root);
  const checks = runChecks(profile);
  const coverage = checks.every((c) => c.status !== 'fallo') ? measureCoverage(profile) : null;
  write('checks.json', { at: new Date().toISOString(), checks, coverage });
  for (const c of checks) console.log(`${c.status === 'ok' ? '✓' : c.status === 'fallo' ? '✘' : '-'} ${c.name} (${c.status})${c.output ? `\n${c.output}` : ''}`);
  console.log(`cobertura de líneas: ${coverage ?? 'no medida'}`);
  process.exit(checks.some((c) => c.status === 'fallo') ? 1 : 0);
} else if (cmd === 'gate') {
  const profile = scanProject(root);
  const saved = readJsonFile<{ checks: CheckResult[]; coverage: number | null }>(join(dir, 'checks.json'));
  if (!saved) {
    console.error('Falta correr `onboard check` antes de la puerta.');
    process.exit(2);
  }
  const net = readJsonFile<SafetyNet>(join(dir, 'safety-net.json'));
  const mapPath = join(dir, 'map.md');
  const result = evaluateSafetyNet({ profile, checks: saved.checks, coverage: saved.coverage, net, mapText: existsSync(mapPath) ? readFileSync(mapPath, 'utf8') : null, exists: (f) => existsSync(join(root, f)) });
  if (!result.ok) {
    console.error(result.problems.map((p) => `✘ ${p}`).join('\n'));
    process.exit(1);
  }
  let commit = 'desconocido';
  try {
    commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    // not a git repository
  }
  write('state.json', { status: 'completo', completedAt: new Date().toISOString(), commit, coverage: saved.coverage ?? undefined } satisfies OnboardingState);
  console.log('Red de seguridad en verde: incorporación completa.');
} else {
  console.error('Uso: onboard scan|init|check|gate [--path <proyecto>]');
  process.exit(2);
}
