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

export interface ObservationApi {
  listOpen(): { body: string; createdAt: string }[];
  createdSince(since: Date): number;
  create(title: string, body: string): number;
}

export const OBSERVATION_LABEL = 'origen:observacion';

// Issues created by the post-release observation, so duplicates and the daily cap can be enforced.
export function observationApi(repo: string, run: Runner = defaultRunner): ObservationApi {
  const list = (state: 'open' | 'all', since?: Date) =>
    JSON.parse(run(['api', `repos/${repo}/issues?labels=${encodeURIComponent(OBSERVATION_LABEL)}&state=${state}&per_page=100${since ? `&since=${since.toISOString()}` : ''}`])) as { body: string | null; created_at: string; pull_request?: unknown }[];
  return {
    listOpen: () => list('open').filter((i) => !i.pull_request).map((i) => ({ body: i.body ?? '', createdAt: i.created_at })),
    createdSince: (since) => list('all', since).filter((i) => !i.pull_request && new Date(i.created_at) >= since).length,
    create(title, body) {
      try {
        run(['api', '-X', 'POST', `repos/${repo}/labels`, '-f', `name=${OBSERVATION_LABEL}`]);
      } catch {
        // label already exists
      }
      const out = run(['api', '-X', 'POST', `repos/${repo}/issues`, '-f', `title=${title}`, '-f', `body=${body}`, '-f', 'labels[]=factory', '-f', `labels[]=${OBSERVATION_LABEL}`]);
      return (JSON.parse(out) as { number: number }).number;
    },
  };
}
