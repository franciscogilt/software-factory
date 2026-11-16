import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

export function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function jobPath(stateDir: string, id: string): string {
  return join(stateDir, 'jobs', `${id}.json`);
}

export function listJobFiles(stateDir: string): string[] {
  const dir = join(stateDir, 'jobs');
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)) : [];
}

// Emergency switch: while this file exists nothing starts or advances.
export function isStopped(stateDir: string): boolean {
  return existsSync(join(stateDir, 'EMERGENCY_STOP'));
}
