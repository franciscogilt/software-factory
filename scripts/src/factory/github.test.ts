import { describe, expect, it } from 'vitest';
import { githubTracker } from './github.ts';

describe('githubTracker', () => {
  it('lists issues, skipping pull requests', async () => {
    const t = githubTracker('o/r', () =>
      JSON.stringify([
        { number: 1, title: 'a', body: null, labels: [{ name: 'factory' }] },
        { number: 2, title: 'pr', body: 'x', labels: [], pull_request: {} },
      ]),
    );
    const list = await t.listLabeled('factory');
    expect(list).toEqual([{ tracker: 'github', id: '1', title: 'a', body: '', labels: ['factory'] }]);
  });

  it('uses the LAST person who put the label and their repo permission', async () => {
    const calls: string[] = [];
    const t = githubTracker('o/r', (args) => {
      calls.push(args[1]!);
      if (args[1]!.includes('/events')) {
        return JSON.stringify([
          { event: 'labeled', label: { name: 'factory' }, actor: { login: 'old' } },
          { event: 'labeled', label: { name: 'otra' }, actor: { login: 'zzz' } },
          { event: 'labeled', label: { name: 'factory' }, actor: { login: 'new' } },
        ]);
      }
      return JSON.stringify({ permission: 'triage' });
    });
    expect(await t.labeler('1', 'factory')).toEqual({ login: 'new', permission: 'triage' });
    expect(calls[1]).toContain('/collaborators/new/permission');
  });

  it('falls back to the repository owner when the permission lookup fails, and only then', async () => {
    const tracker = (actor: string, ownerType = 'User') =>
      githubTracker('o/r', (args) => {
        const path = args[1]!;
        if (path.includes('/events')) return JSON.stringify([{ event: 'labeled', label: { name: 'factory' }, actor: { login: actor } }]);
        if (path.includes('/collaborators/')) throw new Error('403');
        return JSON.stringify({ owner: { login: 'o', type: ownerType } });
      });
    expect((await tracker('o').labeler('1', 'factory'))?.permission).toBe('admin');
    expect((await tracker('intruso').labeler('1', 'factory'))?.permission).toBe('none');
    expect((await tracker('o', 'Organization').labeler('1', 'factory'))?.permission).toBe('none');
  });

  it('returns null when nobody labeled it, and none permission when the lookup fails', async () => {
    expect(await githubTracker('o/r', () => '[]').labeler('1', 'factory')).toBeNull();
    const t = githubTracker('o/r', (args) => {
      if (args[1]!.includes('/events')) return JSON.stringify([{ event: 'labeled', label: { name: 'factory' }, actor: { login: 'x' } }]);
      throw new Error('404');
    });
    expect((await t.labeler('1', 'factory'))?.permission).toBe('none');
  });
});

describe('observationApi', () => {
  it('lists open observation tickets, counts today ones, and creates with both labels', async () => {
    const { observationApi } = await import('./github.ts');
    const calls: string[][] = [];
    const api = observationApi('o/r', (args) => {
      calls.push(args);
      if (args[1] === '-X') return args.includes('repos/o/r/issues') ? '{"number":42}' : '{}';
      return JSON.stringify([
        { body: 'x', created_at: '2026-11-15T10:00:00Z' },
        { body: 'y', created_at: '2026-11-14T10:00:00Z' },
        { body: 'pr', created_at: '2026-11-15T11:00:00Z', pull_request: {} },
      ]);
    });
    expect(api.listOpen()).toHaveLength(2);
    expect(api.createdSince(new Date('2026-11-15T00:00:00Z'))).toBe(1);
    expect(api.create('t', 'b')).toBe(42);
    const create = calls.find((c) => c.includes('repos/o/r/issues'))!;
    expect(create).toContain('labels[]=factory');
    expect(create).toContain('labels[]=origen:observacion');
  });
});
