// Runs the existing project's own checks in a minimal environment (no secrets of the one running this), with time limits.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Profile } from './scan.ts';

export interface RunResult {
  status: number | null;
  timedOut: boolean;
  output: string;
  ms: number;
}
export type Runner = (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs: number) => RunResult;

export interface CheckResult {
  name: 'instalacion' | 'compilacion' | 'tipos' | 'linter' | 'pruebas';
  status: 'ok' | 'fallo' | 'ausente';
  ms: number;
  output: string;
}

export const minimalEnv = (): NodeJS.ProcessEnv => ({ PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', NODE_ENV: 'test', NEXT_TELEMETRY_DISABLED: '1' });

export const defaultRunner: Runner = (command, args, cwd, env, timeoutMs) => {
  const start = Date.now();
  const r = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n').slice(-15).join('\n');
  return { status: r.status, timedOut: r.error?.name === 'Error' && /ETIMEDOUT/.test(String(r.error)), output: text, ms: Date.now() - start };
};

function pmCommands(p: Profile): { install: [string, string[]] | null; run: (script: string) => [string, string[]]; exec: (...a: string[]) => [string, string[]] } {
  switch (p.packageManager) {
    case 'pnpm': return { install: ['pnpm', ['install', '--frozen-lockfile']], run: (s) => ['pnpm', ['run', s]], exec: (...a) => ['pnpm', ['exec', ...a]] };
    case 'yarn': return { install: ['yarn', ['install', '--frozen-lockfile']], run: (s) => ['yarn', [s]], exec: (...a) => ['yarn', a] };
    case 'bun': return { install: ['bun', ['install', '--frozen-lockfile']], run: (s) => ['bun', ['run', s]], exec: (...a) => ['bunx', a] };
    default: return { install: ['npm', ['ci']], run: (s) => ['npm', ['run', s]], exec: (...a) => ['npx', ['--no-install', ...a]] };
  }
}

export function runChecks(p: Profile, runner: Runner = defaultRunner, env = minimalEnv()): CheckResult[] {
  const pm = pmCommands(p);
  const results: CheckResult[] = [];
  const run = (name: CheckResult['name'], cmd: [string, string[]] | null, timeoutMs: number): boolean => {
    if (!cmd) {
      results.push({ name, status: 'ausente', ms: 0, output: '' });
      return true;
    }
    const r = runner(cmd[0], cmd[1], p.root, env, timeoutMs);
    const ok = r.status === 0 && !r.timedOut;
    results.push({ name, status: ok ? 'ok' : 'fallo', ms: r.ms, output: ok ? '' : r.timedOut ? `tiempo límite superado (${timeoutMs / 1000}s)\n${r.output}` : r.output });
    return ok;
  };
  const script = (...names: string[]) => names.find((n) => p.scripts[n]);
  const orNull = (n: string | undefined): [string, string[]] | null => (n ? pm.run(n) : null);

  // Stop at the first failure of install: nothing else can run without dependencies.
  if (!run('instalacion', p.packageManager === 'unknown' && Object.keys(p.scripts).length === 0 ? null : pm.install, 600_000)) return results;
  run('compilacion', orNull(script('build')), 900_000);
  run('tipos', orNull(script('typecheck', 'type-check', 'tsc')), 300_000);
  run('linter', orNull(script('lint')), 300_000);
  run('pruebas', orNull(script('test')), 900_000);
  return results;
}

// Coverage is measured with the project's own runner; null means it could not be measured.
export function measureCoverage(p: Profile, runner: Runner = defaultRunner, env = minimalEnv()): number | null {
  const pm = pmCommands(p);
  const cmd =
    p.testRunner === 'vitest' ? pm.exec('vitest', 'run', '--coverage', '--coverage.reporter=json-summary')
    : p.testRunner === 'jest' ? pm.exec('jest', '--coverage', '--coverageReporters=json-summary')
    : null;
  if (!cmd) return null;
  const r = runner(cmd[0], cmd[1], p.root, env, 900_000);
  if (r.status !== 0) return null;
  return parseCoverageSummary(join(p.root, 'coverage', 'coverage-summary.json'));
}

export function parseCoverageSummary(path: string): number | null {
  if (!existsSync(path)) return null;
  try {
    const pct = (JSON.parse(readFileSync(path, 'utf8')) as { total?: { lines?: { pct?: number } } }).total?.lines?.pct;
    return typeof pct === 'number' ? pct : null;
  } catch {
    return null;
  }
}
