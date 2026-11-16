import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runIntake, type Tracker } from '../factory/intake.ts';
import type { Limits } from '../factory/limits.ts';
import { validateMap } from '../factory/outputs.ts';
import { measureCoverage, minimalEnv, parseCoverageSummary, runChecks, type Runner } from './checks.ts';
import { evaluateSafetyNet, onboardingStatus, type GateInput } from './gate.ts';
import { scanProject } from './scan.ts';

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'proj-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}
const pkg = (extra: object = {}) => JSON.stringify({ dependencies: { next: '15', react: '19', stripe: '1' }, devDependencies: { vitest: '3' }, scripts: { build: 'next build', test: 'vitest run', lint: 'eslint .' }, ...extra });

describe('scanProject', () => {
  const root = project({
    'package.json': pkg(),
    'pnpm-lock.yaml': '',
    'src/lib/auth.ts': '// TODO: rotate keys\nexport const a = 1;',
    'src/lib/payments/charge.ts': 'export const c = 1;',
    'src/lib/auth.test.ts': 'test',
    'node_modules/x/index.js': 'ignored',
    'Dockerfile': 'FROM node',
    '.github/workflows/ci.yml': 'on: push',
    'db/migrations/0001.sql': 'select 1;',
  });
  const p = scanProject(root);
  it('describes the project without running it', () => {
    expect(p.packageManager).toBe('pnpm');
    expect(p.frameworks).toEqual(expect.arrayContaining(['next', 'react', 'stripe']));
    expect(p.testRunner).toBe('vitest');
    expect(p.testFiles).toBe(1);
    expect(p.sourceFiles).toBe(2);
    expect(p.hasDocker).toBe(true);
    expect(p.ci).toEqual(['.github/workflows/ci.yml']);
    expect(p.migrations).toEqual(['db/migrations/0001.sql']);
    expect(p.debtMarkers).toBe(1);
  });
  it('ignores node_modules and finds critical candidates by path', () => {
    expect(p.languages.javascript).toBeUndefined();
    expect(Object.keys(p.criticalCandidates).sort()).toEqual(['autenticacion', 'pagos']);
  });
  it('flags a project without tests', () => {
    const bare = scanProject(project({ 'package.json': JSON.stringify({ scripts: {} }), 'src/a.ts': 'x' }));
    expect(bare.testRunner).toBe('none');
    expect(bare.testFiles).toBe(0);
  });
  it('survives a broken package.json', () => {
    expect(scanProject(project({ 'package.json': '{ nope', 'a.py': 'x' })).languages.python).toBe(1);
  });
});

describe('runChecks', () => {
  const profile = scanProject(project({ 'package.json': pkg(), 'pnpm-lock.yaml': '', 'src/a.ts': 'x' }));
  const ok: Runner = () => ({ status: 0, timedOut: false, output: '', ms: 1 });

  it('runs install, build, lint and test; marks missing scripts as absent', () => {
    const r = runChecks(profile, ok);
    expect(Object.fromEntries(r.map((c) => [c.name, c.status]))).toEqual({ instalacion: 'ok', compilacion: 'ok', tipos: 'ausente', linter: 'ok', pruebas: 'ok' });
  });
  it('stops after a failed install and reports failures with output', () => {
    const calls: string[] = [];
    const r = runChecks(profile, (c, a) => (calls.push(`${c} ${a.join(' ')}`), { status: 1, timedOut: false, output: 'ERR_PNPM', ms: 1 }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'instalacion', status: 'fallo', output: 'ERR_PNPM' });
    expect(calls).toEqual(['pnpm install --frozen-lockfile']);
  });
  it('treats a timeout as a failure', () => {
    const r = runChecks(profile, (c, a) => (a.includes('test') ? { status: null, timedOut: true, output: '', ms: 9 } : { status: 0, timedOut: false, output: '', ms: 1 }));
    expect(r.find((c) => c.name === 'pruebas')?.status).toBe('fallo');
  });
  it('passes a minimal environment without secrets and with time limits', () => {
    const seen: NodeJS.ProcessEnv[] = [];
    const limits: number[] = [];
    process.env.SUPER_SECRET_TOKEN = 'x';
    runChecks(profile, (_c, _a, _cwd, env, t) => (seen.push(env), limits.push(t), { status: 0, timedOut: false, output: '', ms: 1 }), minimalEnv());
    delete process.env.SUPER_SECRET_TOKEN;
    expect(seen.every((e) => !('SUPER_SECRET_TOKEN' in e) && e.CI === 'true')).toBe(true);
    expect(limits.every((t) => t > 0 && t <= 900_000)).toBe(true);
  });
});

describe('coverage', () => {
  it('parses the json-summary total and tolerates absence or garbage', () => {
    const root = project({ 'coverage/coverage-summary.json': JSON.stringify({ total: { lines: { pct: 61.5 } } }), 'bad/coverage-summary.json': '{x' });
    expect(parseCoverageSummary(join(root, 'coverage/coverage-summary.json'))).toBe(61.5);
    expect(parseCoverageSummary(join(root, 'bad/coverage-summary.json'))).toBeNull();
    expect(parseCoverageSummary(join(root, 'none.json'))).toBeNull();
  });
  it('cannot measure without a known runner', () => {
    const p = scanProject(project({ 'package.json': JSON.stringify({ scripts: {} }) }));
    expect(measureCoverage(p, () => ({ status: 0, timedOut: false, output: '', ms: 1 }))).toBeNull();
  });
});

const GOOD_MAP = `# Mapa

## Cómo correrlo
pnpm install && pnpm dev, necesita DATABASE_URL.

## Arquitectura
Monolito Next.js con rutas API y una base PostgreSQL.

## Módulos
auth, payments, reports: cada uno en src/lib/<nombre>.

## Convenciones
Nombres en inglés, pruebas junto al código con sufijo .test.ts.

## Dependencias
next, react, stripe; sin actualizar desde 2024.

## Deudas
Dos TODO en auth.ts y ninguna prueba de pagos.

## Flujos críticos
Inicio de sesión y cobro con Stripe.
`;

describe('validateMap', () => {
  it('accepts a complete map', () => expect(validateMap(GOOD_MAP)).toEqual([]));
  it('rejects missing, empty and templated sections', () => {
    expect(validateMap(GOOD_MAP.replace(/## Deudas[\s\S]*?(?=## Flujos)/, ''))).toEqual(['falta la sección Deudas']);
    expect(validateMap(GOOD_MAP.replace('Dos TODO en auth.ts y ninguna prueba de pagos.', 'x'))).toEqual(['la sección Deudas está vacía']);
    expect(validateMap(GOOD_MAP.replace('Monolito Next.js', '{{describir}}'))).toEqual(['quedan marcadores de plantilla {{…}} sin llenar']);
  });
});

describe('evaluateSafetyNet', () => {
  const profile = scanProject(project({ 'package.json': pkg(), 'a.test.ts': 'x', 'src/b.ts': 'x' }));
  const green = [
    { name: 'instalacion', status: 'ok', ms: 1, output: '' },
    { name: 'compilacion', status: 'ok', ms: 1, output: '' },
    { name: 'pruebas', status: 'ok', ms: 1, output: '' },
  ] as GateInput['checks'];
  const base: GateInput = {
    profile,
    checks: green,
    coverage: 42,
    net: { flows: { autenticacion: ['tests/auth.characterization.test.ts'], pagos: ['tests/pay.characterization.test.ts'] } },
    mapText: GOOD_MAP,
    exists: () => true,
  };
  it('passes with everything in place', () => expect(evaluateSafetyNet(base)).toEqual({ ok: true, problems: [] }));
  it('fails without a map', () => expect(evaluateSafetyNet({ ...base, mapText: null }).problems[0]).toContain('mapa'));
  it('says fixing a broken project is the first job', () => {
    const r = evaluateSafetyNet({ ...base, checks: [{ name: 'compilacion', status: 'fallo', ms: 1, output: 'x' }, ...green.slice(2)] });
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toContain('primer trabajo');
  });
  it('names a flow without existing characterization tests', () => {
    const r = evaluateSafetyNet({ ...base, exists: (f) => !f.includes('pay') });
    expect(r.problems).toEqual(['el flujo crítico "pagos" no tiene pruebas de caracterización existentes (nombre con "characterization")']);
    const renamed = evaluateSafetyNet({ ...base, net: { flows: { pagos: ['tests/pay.test.ts'] } } });
    expect(renamed.problems.join()).toContain('"pagos"');
  });
  it('requires declared flows, a test script and measured coverage', () => {
    expect(evaluateSafetyNet({ ...base, net: { flows: {} } }).ok).toBe(false);
    expect(evaluateSafetyNet({ ...base, net: null }).ok).toBe(false);
    expect(evaluateSafetyNet({ ...base, checks: green.slice(0, 2) }).problems.join()).toContain('script "test"');
    expect(evaluateSafetyNet({ ...base, coverage: null }).problems).toEqual(['no se pudo medir la cobertura']);
  });
  it('reports no safety net for a project without tests', () => {
    const bare = scanProject(project({ 'package.json': JSON.stringify({ scripts: { test: 'echo' } }), 'src/a.ts': 'x' }));
    expect(evaluateSafetyNet({ ...base, profile: bare }).problems.join()).toContain('sin red de seguridad');
  });
});

describe('onboardingStatus and intake', () => {
  const limits: Limits = { costPerTaskUsd: 5, minutesPerTask: 120, maxRetries: 3, maxConcurrentJobs: 2, autoTicketsPerDay: 5 };
  const tracker: Tracker = { name: 'github', listLabeled: async () => [], labeler: async () => null, comment: async () => undefined };
  it('does not apply to new products or products without config', () => {
    expect(onboardingStatus(project({}))).toBe('no-aplica');
    expect(onboardingStatus(project({ 'product.config.yaml': 'origin: new\n' }))).toBe('no-aplica');
  });
  it('is pending for an existing product until state.json says complete', () => {
    expect(onboardingStatus(project({ 'product.config.yaml': 'origin: existing\n' }))).toBe('pendiente');
    expect(onboardingStatus(project({ 'product.config.yaml': 'origin: existing\n', 'docs/onboarding/state.json': '{"status":"pendiente"}' }))).toBe('pendiente');
    expect(onboardingStatus(project({ 'product.config.yaml': 'origin: existing\n', 'docs/onboarding/state.json': '{"status":"completo"}' }))).toBe('completo');
  });
  it('makes the orchestrator refuse tickets while onboarding is pending', async () => {
    const base = { tracker, existing: [], limits, now: new Date(), stopped: false };
    await expect(runIntake({ ...base, onboarding: 'pendiente' })).rejects.toThrow(/red de seguridad/);
    await expect(runIntake({ ...base, onboarding: 'completo' })).resolves.toBeDefined();
    await expect(runIntake({ ...base, onboarding: 'no-aplica' })).resolves.toBeDefined();
  });
});

describe('discoveryStatus and repo detection', () => {
  const limits: Limits = { costPerTaskUsd: 5, minutesPerTask: 120, maxRetries: 3, maxConcurrentJobs: 2, autoTicketsPerDay: 5 };
  const tracker: Tracker = { name: 'github', listLabeled: async () => [], labeler: async () => null, comment: async () => undefined };
  it('reads the validation state of a new SaaS', async () => {
    const { discoveryStatus } = await import('./gate.ts');
    expect(discoveryStatus(project({}))).toBe('no-aplica');
    expect(discoveryStatus(project({ 'product.config.yaml': 'type: saas\nvalidation: pending   # nota\n' }))).toBe('pendiente');
    expect(discoveryStatus(project({ 'product.config.yaml': 'validation: approved\n' }))).toBe('aprobada');
  });
  it('makes the orchestrator refuse tickets until the owner approves the validation', async () => {
    const base = { tracker, existing: [], limits, now: new Date(), stopped: false };
    await expect(runIntake({ ...base, discovery: 'pendiente' })).rejects.toThrow(/validación/);
    await expect(runIntake({ ...base, discovery: 'aprobada' })).resolves.toBeDefined();
  });
  it('finds owner/repo from the environment or the remote', async () => {
    const { defaultRepo, parseRepo } = await import('../repo.ts');
    expect(parseRepo('https://github.com/franciscogilt/agenda-citas.git')).toBe('franciscogilt/agenda-citas');
    expect(parseRepo('git@github.com:o/r.git')).toBe('o/r');
    expect(parseRepo('http://local_proxy@127.0.0.1:1234/git/o/r')).toBe('o/r');
    expect(defaultRepo({ GITHUB_REPOSITORY: 'a/b' } as NodeJS.ProcessEnv)).toBe('a/b');
    expect(defaultRepo({} as NodeJS.ProcessEnv, () => 'https://github.com/x/y.git')).toBe('x/y');
    expect(() => defaultRepo({} as NodeJS.ProcessEnv, () => { throw new Error('no remote'); })).toThrow(/GITHUB_REPOSITORY/);
  });
});
