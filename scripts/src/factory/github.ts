import { execFileSync } from 'node:child_process';
import type { Labeler, Ticket, Tracker } from './intake.ts';

type Runner = (args: string[]) => string;
const defaultRunner: Runner = (args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

// GitHub Issues through REST (GraphQL is not reachable from every environment).
export function githubTracker(repo: string, run: Runner = defaultRunner): Tracker {
  const api = <T>(path: string, ...extra: string[]): T => JSON.parse(run(['api', path, ...extra]) || 'null') as T;
  return {
    name: 'github',
    async listLabeled(label) {
      const issues = api<{ number: number; title: string; body: string | null; labels: { name: string }[]; pull_request?: unknown }[]>(
        `repos/${repo}/issues?labels=${encodeURIComponent(label)}&state=open&per_page=100`,
      );
      return issues
        .filter((i) => !i.pull_request)
        .map((i): Ticket => ({ tracker: 'github', id: String(i.number), title: i.title, body: i.body ?? '', labels: i.labels.map((l) => l.name) }));
    },
    async labeler(ticketId, label): Promise<Labeler | null> {
      const events = api<{ event: string; label?: { name: string }; actor?: { login: string } }[]>(`repos/${repo}/issues/${ticketId}/events?per_page=100`);
      const last = events.filter((e) => e.event === 'labeled' && e.label?.name === label).at(-1);
      if (!last?.actor) return null;
      try {
        const p = api<{ permission: Labeler['permission'] }>(`repos/${repo}/collaborators/${last.actor.login}/permission`);
        return { login: last.actor.login, permission: p.permission };
      } catch {
        // The permission endpoint can be unreachable (proxy, token scope). Fail closed, except for the
        // owner of a personal repository, who always has admin rights.
        try {
          const r = api<{ owner: { login: string; type: string } }>(`repos/${repo}`);
          const isOwner = r.owner.type === 'User' && r.owner.login === last.actor.login;
          return { login: last.actor.login, permission: isOwner ? 'admin' : 'none' };
        } catch {
          return { login: last.actor.login, permission: 'none' };
        }
      }
    },
    async comment(ticketId, body) {
      run(['api', '-X', 'POST', `repos/${repo}/issues/${ticketId}/comments`, '-f', `body=${body}`]);
    },
  };
}
