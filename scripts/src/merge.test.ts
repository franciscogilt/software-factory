import { describe, expect, it } from 'vitest';
import { decideMerge, type MergeInput } from './merge.ts';

const base: MergeInput = {
  level: 'bajo',
  author: 'bot',
  headSha: 'abc',
  draft: false,
  mergeable: true,
  checks: [
    { name: 'check', conclusion: 'success' },
    { name: 'e2e', conclusion: 'success' },
  ],
  requiredChecks: ['check', 'e2e'],
  reviews: [],
  owner: 'dueno',
  reviewers: ['revisor-bot'],
};
const approve = (user: string, commitId = 'abc') => ({ user, state: 'APPROVED' as const, commitId });

describe('decideMerge', () => {
  it('lets low risk merge alone when gates are green', () => {
    expect(decideMerge(base).allow).toBe(true);
  });

  it('refuses when a gate fails or is pending or missing', () => {
    expect(decideMerge({ ...base, checks: [{ name: 'check', conclusion: 'failure' }, base.checks[1]!] }).allow).toBe(false);
    expect(decideMerge({ ...base, checks: [{ name: 'check', conclusion: 'success' }, { name: 'e2e', conclusion: null }] }).allow).toBe(false);
    expect(decideMerge({ ...base, checks: [base.checks[0]!] }).reasons.join()).toContain('e2e');
  });

  it('refuses drafts and unmergeable PRs for every level', () => {
    expect(decideMerge({ ...base, draft: true }).allow).toBe(false);
    expect(decideMerge({ ...base, mergeable: false }).allow).toBe(false);
    expect(decideMerge({ ...base, mergeable: null }).allow).toBe(false);
  });

  it('requires a different reviewer for medium', () => {
    const m = { ...base, level: 'medio' as const };
    expect(decideMerge(m).allow).toBe(false);
    expect(decideMerge({ ...m, reviews: [approve('bot')] }).allow).toBe(false); // author cannot approve own work
    expect(decideMerge({ ...m, reviews: [approve('stranger')] }).allow).toBe(false);
    expect(decideMerge({ ...m, reviews: [approve('revisor-bot')] }).allow).toBe(true);
    expect(decideMerge({ ...m, reviews: [approve('dueno')] }).allow).toBe(true);
  });

  it('requires the owner for high; nobody else counts', () => {
    const h = { ...base, level: 'alto' as const };
    expect(decideMerge({ ...h, reviews: [approve('revisor-bot')] }).allow).toBe(false);
    expect(decideMerge({ ...h, reviews: [approve('dueno')] }).allow).toBe(true);
  });

  it('ignores approvals of an old commit', () => {
    const h = { ...base, level: 'alto' as const, reviews: [approve('dueno', 'old')] };
    expect(decideMerge(h).allow).toBe(false);
  });

  it('uses the latest review per user (a later change request cancels an approval)', () => {
    const h = {
      ...base,
      level: 'alto' as const,
      reviews: [approve('dueno'), { user: 'dueno', state: 'CHANGES_REQUESTED' as const, commitId: 'abc' }],
    };
    const d = decideMerge(h);
    expect(d.allow).toBe(false);
    expect(d.reasons.join()).toContain('cambios solicitados');
  });

  it('does not let plain comments cancel an approval', () => {
    const h = { ...base, level: 'alto' as const, reviews: [approve('dueno'), { user: 'dueno', state: 'COMMENTED' as const, commitId: 'abc' }] };
    expect(decideMerge(h).allow).toBe(true);
  });
});
