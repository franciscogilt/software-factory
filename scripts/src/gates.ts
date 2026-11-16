// Gate runner: scripts, not agents. CI only invokes this file so every platform behaves the same.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Gate {
  name: string;
  command: string;
  args: string[];
  tier: 'rapida' | 'completa';
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
export function docsGate(files: string[]): { ok: boolean; reason?: string } {
  const code = files.filter((f) => /^(apps|packages)\/[^/]+\/(src|seed|migrations)\//.test(f) && !/\.test\.[tj]sx?$/.test(f));
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
  const r = spawnSync(gate.command, gate.args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ok = r.status === 0;
  return { name: gate.name, status: ok ? 'ok' : 'fallo', ms: Date.now() - start, output: ok ? '' : tail(`${r.stdout ?? ''}\n${r.stderr ?? ''}\n${r.error?.message ?? ''}`) };
}

export function runGates(opts: { job: string; statePath: string; tier: 'rapida' | 'completa'; files: string[] }): JobState {
  const state = loadState(opts.statePath, opts.job);
  const selected = GATES.filter((g) => opts.tier === 'completa' || g.tier === 'rapida');
  for (const gate of selected) {
    state.gates[gate.name] = runGate(gate); // re-running overwrites: no duplicated effects
    state.updatedAt = new Date().toISOString();
    saveState(opts.statePath, state);
  }
  const docs = docsGate(opts.files);
  state.gates['documentacion'] = { name: 'documentacion', status: docs.ok ? 'ok' : 'fallo', ms: 0, output: docs.reason ?? '' };
  saveState(opts.statePath, state);
  return state;
}
