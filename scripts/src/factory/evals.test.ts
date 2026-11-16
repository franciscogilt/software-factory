import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEvalCases, runEval } from './evals.ts';

const root = resolve(import.meta.dirname, '../../..');
const cases = loadEvalCases(resolve(root, 'evals'));

describe('evals', () => {
  it('has at least one case for analista, revisor, gerente, auditor-seguridad and arquitecto', () => {
    const roles = new Set(cases.map((c) => c.case.role));
    for (const r of ['analista', 'revisor', 'gerente', 'auditor-seguridad', 'arquitecto']) expect(roles.has(r as never)).toBe(true);
  });

  describe.each(cases.map((c) => [c.file, c.case] as const))('%s', (_file, c) => {
    it('accepts its golden good output', () => {
      expect(runEval(c, readFileSync(resolve(root, c.good), 'utf8'))).toEqual([]);
    });
    it('rejects its golden bad output', () => {
      expect(runEval(c, readFileSync(resolve(root, c.bad), 'utf8')).length).toBeGreaterThan(0);
    });
    it('names the role of its folder and an output path for one file', () => {
      expect(c.ticket.length).toBeGreaterThan(10);
      expect(c.output).toMatch(/\.(md|json)$/);
    });
  });
});
