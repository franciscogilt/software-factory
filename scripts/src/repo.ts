import { execFileSync } from 'node:child_process';

// owner/repo from a git remote URL (https, ssh or a proxy path ending in owner/repo[.git]).
export function parseRepo(url: string): string | null {
  const m = /([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

// The repository the tools act on: GITHUB_REPOSITORY, else the origin remote of the current checkout.
export function defaultRepo(env: NodeJS.ProcessEnv = process.env, remote: () => string = () => execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' })): string {
  if (env.GITHUB_REPOSITORY) return env.GITHUB_REPOSITORY;
  let repo: string | null = null;
  try {
    repo = parseRepo(remote());
  } catch {
    // no remote
  }
  if (!repo) throw new Error('No se pudo saber el repositorio: define GITHUB_REPOSITORY (owner/repo)');
  return repo;
}
