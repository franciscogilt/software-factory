import { readFileSync } from 'node:fs';

export interface Limits {
  costPerTaskUsd: number;
  minutesPerTask: number;
  maxRetries: number;
  maxConcurrentJobs: number;
  autoTicketsPerDay: number;
}

const KEYS: Record<string, keyof Limits> = {
  costo_por_tarea_usd: 'costPerTaskUsd',
  tiempo_por_tarea_min: 'minutesPerTask',
  reintentos_max: 'maxRetries',
  trabajos_simultaneos: 'maxConcurrentJobs',
  tickets_automaticos_por_dia: 'autoTicketsPerDay',
};

// Reads the fenced ```limites block of docs/limits.md. Fails closed: missing or invalid values throw.
export function parseLimits(markdown: string): Limits {
  const block = /```limites\n([\s\S]*?)```/.exec(markdown)?.[1];
  if (!block) throw new Error('docs/limits.md no tiene el bloque ```limites');
  const out: Partial<Limits> = {};
  for (const line of block.split('\n')) {
    const m = /^\s*([a-z_]+)\s*:\s*(\S+)\s*$/.exec(line);
    if (!m) continue;
    const key = KEYS[m[1]!];
    if (!key) throw new Error(`Límite desconocido: ${m[1]}`);
    const value = Number(m[2]);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Límite inválido ${m[1]}: ${m[2]}`);
    out[key] = value;
  }
  for (const [name, key] of Object.entries(KEYS)) {
    if (out[key] === undefined) throw new Error(`Falta el límite ${name} en docs/limits.md`);
  }
  if (out.maxRetries! > 3) throw new Error('reintentos_max no puede superar 3 (regla de robustez)');
  return out as Limits;
}

export function loadLimits(path = 'docs/limits.md'): Limits {
  return parseLimits(readFileSync(path, 'utf8'));
}
