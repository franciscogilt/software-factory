import { describe, expect, it } from 'vitest';
import { classifyRisk, classifyFile } from './risk.ts';
import { chooseMode } from './mode.ts';

describe('classifyRisk', () => {
  it('treats docs, ui texts and styles as low', () => {
    const r = classifyRisk(['docs/modules/i18n.md', 'apps/web/src/i18n/messages/es.ts', 'apps/web/src/app/globals.css']);
    expect(r.level).toBe('bajo');
  });

  it.each([
    'packages/db/migrations/0009_x.sql',
    'infra/docker-compose.yml',
    '.github/workflows/ci.yml',
    'apps/web/Dockerfile',
    'CLAUDE.md',
    'docs/rules/autonomia.md',
    '.claude/agents/revisor.md',
    'evals/x.json',
    'apps/web/src/lib/auth.ts',
    'apps/web/src/middleware.ts',
    'packages/db/src/authz.ts',
    'packages/db/src/privacy.ts',
    'packages/db/src/schema.ts',
    'apps/web/src/lib/payments/stripe.ts',
    'scripts/src/merge.ts',
  ])('treats %s as high', (file) => {
    expect(classifyFile(file).level).toBe('alto');
  });

  it('treats ordinary app code and unknown files as medium', () => {
    expect(classifyRisk(['apps/web/src/lib/csv.ts']).level).toBe('medio');
    expect(classifyRisk(['something/unknown.bin']).level).toBe('medio');
  });

  it('takes the highest level of a mix', () => {
    const r = classifyRisk(['docs/modules/a.md', 'apps/web/src/lib/csv.ts', 'infra/x.tf']);
    expect(r.level).toBe('alto');
    expect(r.reasons.join(' ')).toContain('infraestructura');
  });

  it('treats an empty change as high (doubt goes up)', () => {
    expect(classifyRisk([]).level).toBe('alto');
  });

  it('lets an agent raise the level but never lower it', () => {
    expect(classifyRisk(['docs/modules/a.md'], 'alto').level).toBe('alto');
    expect(classifyRisk(['infra/x.tf'], 'bajo').level).toBe('alto');
    expect(classifyRisk(['apps/web/src/lib/csv.ts'], 'bajo').level).toBe('medio');
  });

  it('normalizes ./ prefixes', () => {
    expect(classifyFile('./infra/x.tf').level).toBe('alto');
  });
});

describe('chooseMode', () => {
  it('is light only for small low-risk changes', () => {
    const files = ['docs/modules/a.md'];
    expect(chooseMode(files, 'bajo')).toBe('ligero');
  });
  it('is full for medium, high, empty, large or forced', () => {
    expect(chooseMode(['apps/web/src/lib/csv.ts'], 'medio')).toBe('completo');
    expect(chooseMode(['infra/x.tf'], 'alto')).toBe('completo');
    expect(chooseMode([], 'bajo')).toBe('completo');
    expect(chooseMode(Array.from({ length: 11 }, (_, i) => `docs/modules/${i}.md`), 'bajo')).toBe('completo');
    expect(chooseMode(['docs/modules/a.md'], 'bajo', 'completo')).toBe('completo');
  });
});
