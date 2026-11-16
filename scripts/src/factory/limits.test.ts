import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLimits } from './limits.ts';

const block = (body: string) => `# x\n\n\`\`\`limites\n${body}\n\`\`\`\n`;
const all = 'costo_por_tarea_usd: 5\ntiempo_por_tarea_min: 120\nreintentos_max: 3\ntrabajos_simultaneos: 2\ntickets_automaticos_por_dia: 5';

describe('parseLimits', () => {
  it('parses the real docs/limits.md', () => {
    const l = parseLimits(readFileSync(new URL('../../../docs/limits.md', import.meta.url), 'utf8'));
    expect(l.maxRetries).toBeLessThanOrEqual(3);
    expect(l.costPerTaskUsd).toBeGreaterThan(0);
  });
  it('fails closed without the block, with a missing key, an unknown key or bad values', () => {
    expect(() => parseLimits('# nada')).toThrow(/bloque/);
    expect(() => parseLimits(block(all.replace('reintentos_max: 3\n', '')))).toThrow(/reintentos_max/);
    expect(() => parseLimits(block(`${all}\nextra: 1`))).toThrow(/desconocido/);
    expect(() => parseLimits(block(all.replace('costo_por_tarea_usd: 5', 'costo_por_tarea_usd: abc')))).toThrow(/inválido/);
    expect(() => parseLimits(block(all.replace('costo_por_tarea_usd: 5', 'costo_por_tarea_usd: 0')))).toThrow(/inválido/);
  });
  it('never allows more than 3 retries', () => {
    expect(() => parseLimits(block(all.replace('reintentos_max: 3', 'reintentos_max: 4')))).toThrow(/3/);
  });
});
