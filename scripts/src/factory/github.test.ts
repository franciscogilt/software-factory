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
