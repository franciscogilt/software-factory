import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { docsGate, loadState, saveState, tail } from './gates.ts';

describe('docsGate', () => {
  it('passes when only docs or tests changed', () => {
    expect(docsGate(['docs/modules/a.md']).ok).toBe(true);
    expect(docsGate(['apps/web/src/lib/x.test.ts']).ok).toBe(true);
  });
  it('fails when code changes without documentation', () => {
    expect(docsGate(['apps/web/src/lib/csv.ts']).ok).toBe(false);
    expect(docsGate(['packages/db/src/audit.ts']).ok).toBe(false);
  });
  it('passes when code comes with module docs, an ADR or a changelog', () => {
    expect(docsGate(['apps/web/src/lib/csv.ts', 'docs/modules/reportes.md']).ok).toBe(true);
    expect(docsGate(['apps/web/src/lib/csv.ts', 'docs/adr/0003-x.md']).ok).toBe(true);
    expect(docsGate(['apps/web/src/lib/csv.ts', 'CHANGELOG.md']).ok).toBe(true);
  });
});

describe('job state', () => {
  it('writes atomically, overwrites instead of duplicating, and recovers from corruption', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gates-'));
    const path = join(dir, 'state', 'job.json');
    const s = loadState(path, 'job1');
    s.gates['tipos'] = { name: 'tipos', status: 'fallo', ms: 5, output: 'x' };
    saveState(path, s);
    s.gates['tipos'] = { name: 'tipos', status: 'ok', ms: 6, output: '' };
    saveState(path, s);
    const back = JSON.parse(readFileSync(path, 'utf8'));
    expect(Object.keys(back.gates)).toEqual(['tipos']);
    expect(back.gates.tipos.status).toBe('ok');
  });
  it('tail keeps only the last lines', () => {
    const text = Array.from({ length: 40 }, (_, i) => `l${i}`).join('\n');
    expect(tail(text, 3)).toBe('l37\nl38\nl39');
  });
});
