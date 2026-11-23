// Detection and diagnosis for the installer. Nothing here writes to disk or installs software.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Runner } from '../onboard/checks.ts';

export type Case = 'nuevo' | 'existente' | 'instalada';
export type DbMode = 'docker' | 'local';
export const MARKER = '.factory-kit.json';

const NOISE = new Set(['.git', '.DS_Store', 'Thumbs.db']);

export function detectCase(target: string): Case {
  if (!existsSync(target)) return 'nuevo';
  if (existsSync(join(target, MARKER))) return 'instalada';
  return readdirSync(target).some((e) => !NOISE.has(e)) ? 'existente' : 'nuevo';
}

// Database and product names end up in SQL identifiers and file names: keep them to [a-z0-9_].
export function sanitizeName(raw: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (s === '') return 'producto';
  return /^[0-9]/.test(s) ? `p_${s}` : s;
}

export interface Problem {
  tool: string;
  why: string;
  fix: string;
}

const HINTS: Record<string, Record<string, string>> = {
  git: { darwin: 'brew install git', linux: 'sudo apt install git', win32: 'instalar Git for Windows (o usar WSL)' },
  node: { darwin: 'brew install node@22', linux: 'instalar Node 22 con nvm: nvm install 22', win32: 'usar WSL con Node 22' },
  pnpm: { darwin: 'corepack enable && corepack prepare pnpm@10.28.0 --activate', linux: 'corepack enable && corepack prepare pnpm@10.28.0 --activate', win32: 'usar WSL' },
  docker: { darwin: 'instalar Docker Desktop y abrirlo', linux: 'instalar Docker Engine y arrancar el servicio (sudo systemctl start docker)', win32: 'Docker Desktop con WSL' },
  psql: { darwin: 'brew install postgresql@16 && brew services start postgresql@16', linux: 'sudo apt install postgresql postgresql-client && sudo systemctl start postgresql', win32: 'instalar PostgreSQL o usar WSL' },
};
const hint = (tool: string, platform: string) => HINTS[tool]?.[platform] ?? HINTS[tool]?.linux ?? '';

export interface DoctorOptions {
  case: Case;
  db: DbMode;
  platform?: string;
  nodeVersion?: string;
  run: Runner;
}

// Everything is checked before the first file is copied: a half-installed project is worse than none.
export function doctor(o: DoctorOptions): Problem[] {
  const platform = o.platform ?? process.platform;
  const problems: Problem[] = [];
  const ok = (cmd: string, args: string[]) => o.run(cmd, args, process.cwd(), { PATH: process.env.PATH, HOME: process.env.HOME }, 20_000).status === 0;
  const need = (tool: string, why: string) => problems.push({ tool, why, fix: hint(tool, platform) });

  const major = Number((o.nodeVersion ?? process.version).replace(/^v/, '').split('.')[0]);
  if (!(major >= 22)) need('node', `se necesita Node 22 o superior (hay ${o.nodeVersion ?? process.version})`);
  if (!ok('pnpm', ['--version'])) need('pnpm', 'pnpm no está instalado o no responde');
  if (o.case === 'nuevo') {
    if (!ok('git', ['--version'])) need('git', 'git no está instalado');
    if (o.db === 'docker') {
      if (!ok('docker', ['info'])) need('docker', 'Docker no está instalado o su servicio no responde (docker info falla)');
    } else if (!ok('psql', ['--version'])) {
      need('psql', 'no se encuentra psql (cliente de PostgreSQL) para el modo sin Docker');
    }
  }
  return problems;
}

// Auto choice when the user gave none and there is no terminal to ask: Docker when it answers, else local Postgres.
export function chooseDb(run: Runner): DbMode {
  return run('docker', ['info'], process.cwd(), { PATH: process.env.PATH, HOME: process.env.HOME }, 20_000).status === 0 ? 'docker' : 'local';
}
