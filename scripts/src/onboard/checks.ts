// Runs the existing project's own checks in a minimal environment (no secrets of the one running this), with time limits.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseSteps, readStackConfig, type CommandKey, type Commands, type Step } from '../stack/commands.ts';
import { parseCoverageReport, readCoverage } from '../stack/coverage.ts';
import { effectiveCommands } from '../stack/profiles.ts';
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

// No secrets of whoever runs this: only what toolchains need to find themselves (PATH, HOME, JAVA_HOME) plus quiet/CI flags.
export const minimalEnv = (): NodeJS.ProcessEnv => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  ...(process.env.JAVA_HOME ? { JAVA_HOME: process.env.JAVA_HOME } : {}),
  CI: 'true',
  NODE_ENV: 'test',
  NEXT_TELEMETRY_DISABLED: '1',
  DOTNET_CLI_TELEMETRY_OPTOUT: '1',
  DOTNET_NOLOGO: '1',
  PIP_DISABLE_PIP_VERSION_CHECK: '1',
});

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

// The commands to use for this project: declared ones win; Node falls back to its package.json scripts.
function toolchain(p: Profile, declared: Commands | null) {
  const pm = pmCommands(p);
  const cmds = effectiveCommands(p.stack, p.rootFiles, declared);
  const script = (...names: string[]) => names.find((n) => p.scripts[n]);
  const fromScript = (n: string | undefined): Step[] | null => (n ? [pm.run(n)] : null);
  const steps = (key: CommandKey, ...scripts: string[]): Step[] | null => (cmds[key] ? parseSteps(cmds[key]!) : p.stack === 'node' ? fromScript(script(...scripts)) : null);
  const installDefault: Step[] | null = p.stack === 'node' && p.packageManager === 'unknown' && Object.keys(p.scripts).length === 0 ? null : p.stack === 'node' ? [pm.install!] : null;
  return {
    install: cmds.install ? parseSteps(cmds.install) : installDefault,
    build: steps('build', 'build'),
    typecheck: steps('typecheck', 'typecheck', 'type-check', 'tsc'),
    lint: steps('lint', 'lint'),
    test: steps('test', 'test'),
    coverage: cmds.coverage ? parseSteps(cmds.coverage) : null,
    coverageReport: cmds.coverage_report ?? 'coverage/coverage-summary.json',
    pm,
  };
}

export function runChecks(p: Profile, runner: Runner = defaultRunner, env = minimalEnv(), declared: Commands | null = readStackConfig(p.root).commands): CheckResult[] {
  const tc = toolchain(p, declared);
  const results: CheckResult[] = [];
  const run = (name: CheckResult['name'], steps: Step[] | null, timeoutMs: number): boolean => {
    if (!steps) {
      results.push({ name, status: 'ausente', ms: 0, output: '' });
      return true;
    }
    let ms = 0;
    for (const [command, args] of steps) {
      const r = runner(command, args, p.root, env, timeoutMs);
      ms += r.ms;
      if (r.status !== 0 || r.timedOut) {
        results.push({ name, status: 'fallo', ms, output: r.timedOut ? `tiempo límite superado (${timeoutMs / 1000}s)\n${r.output}` : steps.length > 1 ? `${command} ${args.join(' ')}\n${r.output}` : r.output });
        return false; // the next steps of this check depend on this one
      }
    }
    results.push({ name, status: 'ok', ms, output: '' });
    return true;
  };

  // Stop at the first failure of install: nothing else can run without dependencies.
  if (!run('instalacion', tc.install, 600_000)) return results;
  run('compilacion', tc.build, 900_000);
  run('tipos', tc.typecheck, 300_000);
  run('linter', tc.lint, 300_000);
  run('pruebas', tc.test, 900_000);
  return results;
}

// Coverage is measured with the project's own runner; null means it could not be measured.
export function measureCoverage(p: Profile, runner: Runner = defaultRunner, env = minimalEnv(), declared: Commands | null = readStackConfig(p.root).commands): number | null {
  const tc = toolchain(p, declared);
  let steps = tc.coverage;
  if (!steps) {
    const cmd =
      p.testRunner === 'vitest' ? tc.pm.exec('vitest', 'run', '--coverage', '--coverage.reporter=json-summary')
      : p.testRunner === 'jest' ? tc.pm.exec('jest', '--coverage', '--coverageReporters=json-summary')
      : null;
    steps = cmd ? [cmd] : null;
  }
  if (!steps) return null;
  for (const [command, args] of steps) {
    if (runner(command, args, p.root, env, 900_000).status !== 0) return null;
  }
  return readCoverage(p.root, tc.coverageReport);
}

export function parseCoverageSummary(path: string): number | null {
  if (!existsSync(path)) return null;
  try {
    return parseCoverageReport(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
