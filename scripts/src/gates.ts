// Gate runner: scripts, not agents. CI only invokes this file so every platform behaves the same.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseSteps, readStackConfig, type Commands, type Step } from './stack/commands.ts';

export interface Gate {
  name: string;
  command: string;
  args: string[];
  tier: 'rapida' | 'completa';
  steps?: Step[]; // derived gates run several steps in order and stop at the first failure
}

export const GATES: Gate[] = [
  { name: 'estructura', command: 'pnpm', args: ['check'], tier: 'rapida' },
  { name: 'tipos-web', command: 'pnpm', args: ['--filter', '@factory/web', 'typecheck'], tier: 'rapida' },
  { name: 'tipos-db', command: 'pnpm', args: ['--filter', '@factory/db', 'typecheck'], tier: 'rapida' },
  { name: 'tipos-jobs', command: 'pnpm', args: ['--filter', '@factory/jobs', 'typecheck'], tier: 'rapida' },
  { name: 'tipos-scripts', command: 'pnpm', args: ['--filter', '@factory/scripts', 'typecheck'], tier: 'rapida' },
  { name: 'linter', command: 'pnpm', args: ['--filter', '@factory/web', 'lint'], tier: 'rapida' },
  { name: 'pruebas-web', command: 'pnpm', args: ['--filter', '@factory/web', 'test'], tier: 'completa' },
  { name: 'pruebas-db', command: 'pnpm', args: ['--filter', '@factory/db', 'test'], tier: 'completa' },
  { name: 'pruebas-jobs', command: 'pnpm', args: ['--filter', '@factory/jobs', 'test'], tier: 'completa' },
  { name: 'pruebas-scripts', command: 'pnpm', args: ['--filter', '@factory/scripts', 'test'], tier: 'completa' },
  { name: 'licencias', command: 'pnpm', args: ['check:licenses'], tier: 'completa' },
];

// Products that declare `commands:` get their gates from there; everything else keeps the starter kit's gates.
const DERIVED: { name: string; key: keyof Commands; tier: Gate['tier'] }[] = [
  { name: 'compilacion', key: 'build', tier: 'rapida' },
  { name: 'tipos', key: 'typecheck', tier: 'rapida' },
  { name: 'linter', key: 'lint', tier: 'rapida' },
  { name: 'pruebas', key: 'test', tier: 'completa' },
];

export function gatesFromCommands(commands: Commands): Gate[] {
  const gates: Gate[] = DERIVED.filter((d) => commands[d.key]).map((d) => {
    const steps = parseSteps(commands[d.key]!);
    return { name: d.name, command: steps[0]![0], args: steps[0]![1], tier: d.tier, steps };
  });
  // A product without a test command must never look green: the missing gate fails loudly.
  if (!commands.test) {
    gates.push({ name: 'pruebas', command: process.execPath, args: ['-e', 'console.error("commands.test no está declarado en product.config.yaml: sin pruebas no hay puerta verde");process.exit(1)'], tier: 'completa' });
  }
  return gates;
}

export function resolveGates(root = '.'): { gates: Gate[]; generic: boolean } {
  const { commands } = readStackConfig(root);
  return commands ? { gates: gatesFromCommands(commands), generic: true } : { gates: GATES, generic: false };
}

export interface GateResult {
  name: string;
  status: 'ok' | 'fallo';
  ms: number;
  output: string; // last lines only, never the full log
}

export interface JobState {
  job: string;
  updatedAt: string;
  gates: Record<string, GateResult>;
}

// Docs gate: application or package code changed → some documentation must change too.
const GENERIC_SOURCE = /\.(ts|tsx|js|jsx|mjs|py|java|kt|cs|go|rb|php|rs|sql)$/;
const GENERIC_TEST = /(\.test\.|\.spec\.|(^|\/)tests?\/|(^|\/)test_[^/]+\.py$|_test\.(py|go)$|(Test|Tests|IT)\.(java|kt)$|Tests?\.cs$|(^|\/)src\/test\/)/;

export function docsGate(files: string[], generic = false): { ok: boolean; reason?: string } {
  const code = generic
    ? files.filter((f) => GENERIC_SOURCE.test(f) && !GENERIC_TEST.test(f) && !/^(docs|evals|\.github|\.claude)\//.test(f))
    : files.filter((f) => /^(apps|packages)\/[^/]+\/(src|seed|migrations)\//.test(f) && !/\.test\.[tj]sx?$/.test(f));
  if (code.length === 0) return { ok: true };
  const docs = files.some((f) => /^docs\/(modules|adr|specs)\/.+\.md$/.test(f) || f === 'CHANGELOG.md');
  return docs ? { ok: true } : { ok: false, reason: 'hay código nuevo sin documentación del módulo, ADR ni registro de cambios' };
}

export function tail(text: string, lines = 15): string {
  return text.trim().split('\n').slice(-lines).join('\n');
}

export function loadState(path: string, job: string): JobState {
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as JobState;
    } catch {
      // corrupt state: start clean rather than crash the gate
    }
  }
  return { job, updatedAt: new Date().toISOString(), gates: {} };
}

// Atomic write so an interruption never leaves a half-written state file.
export function saveState(path: string, state: JobState): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, path);
}

export function runGate(gate: Gate): GateResult {
  const start = Date.now();
  for (const [command, args] of gate.steps ?? [[gate.command, gate.args] as Step]) {
    const r = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) {
      return { name: gate.name, status: 'fallo', ms: Date.now() - start, output: tail(`${r.stdout ?? ''}\n${r.stderr ?? ''}\n${r.error?.message ?? ''}`) };
    }
  }
  return { name: gate.name, status: 'ok', ms: Date.now() - start, output: '' };
}

export function runGates(opts: { job: string; statePath: string; tier: 'rapida' | 'completa'; files: string[] }): JobState {
  const state = loadState(opts.statePath, opts.job);
  const { gates, generic } = resolveGates();
  const selected = gates.filter((g) => opts.tier === 'completa' || g.tier === 'rapida');
  for (const gate of selected) {
    state.gates[gate.name] = runGate(gate); // re-running overwrites: no duplicated effects
    state.updatedAt = new Date().toISOString();
    saveState(opts.statePath, state);
  }
  const docs = docsGate(opts.files, generic);
  state.gates['documentacion'] = { name: 'documentacion', status: docs.ok ? 'ok' : 'fallo', ms: 0, output: docs.reason ?? '' };
  saveState(opts.statePath, state);
  return state;
}
