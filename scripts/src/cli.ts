import { execFileSync } from 'node:child_process';
import { classifyRisk, type Level } from './risk.ts';
import { chooseMode } from './mode.ts';
import { runGates } from './gates.ts';
import { defaultRepo } from './repo.ts';
import { decideMerge, type Check, type Review } from './merge.ts';

const [cmd, ...rest] = process.argv.slice(2);

// Always work from the repository root, wherever pnpm was invoked.
process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());

function arg(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}

function git(...args: string[]): string[] {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').filter(Boolean);
  } catch (e) {
    console.error(`git ${args.join(' ')} falló: ${(e as { stderr?: string }).stderr ?? e}`);
    process.exit(2);
  }
}

// Committed changes since the base; with --worktree also uncommitted and untracked files (local use).
function changedFiles(base: string): string[] {
  const files = new Set(git('diff', '--name-only', `${base}...HEAD`));
  if (rest.includes('--worktree')) {
    for (const line of git('status', '--porcelain', '-uall')) files.add(line.slice(3).replace(/^.* -> /, ''));
  }
  return [...files];
}

function gh(path: string, ...extra: string[]): unknown {
  return JSON.parse(execFileSync('gh', ['api', path, ...extra], { encoding: 'utf8' }));
}

function parseLevel(v: string | undefined): Level | undefined {
  return v === 'bajo' || v === 'medio' || v === 'alto' ? v : undefined;
}

if (cmd === 'risk') {
  const files = changedFiles(arg('base') ?? 'origin/main');
  const c = classifyRisk(files, parseLevel(arg('suggested')));
  console.log(JSON.stringify({ ...c, mode: chooseMode(files, c.level), files: files.length }, null, 2));
} else if (cmd === 'gates') {
  const files = changedFiles(arg('base') ?? 'origin/main');
  const tier = arg('tier') === 'rapida' ? 'rapida' : 'completa';
  const state = runGates({ job: arg('job') ?? 'local', statePath: arg('state') ?? '.factory-state/local.json', tier, files });
  const failed = Object.values(state.gates).filter((g) => g.status === 'fallo');
  for (const g of failed) console.error(`✘ ${g.name}\n${g.output}`);
  console.log(`${Object.keys(state.gates).length - failed.length}/${Object.keys(state.gates).length} puertas en verde`);
  process.exit(failed.length ? 1 : 0);
} else if (cmd === 'merge') {
  const repo = arg('repo') ?? defaultRepo();
  const pr = arg('pr');
  if (!pr) throw new Error('Falta --pr');
  const owner = process.env.FACTORY_OWNER ?? 'franciscogilt';
  const reviewers = (process.env.FACTORY_REVIEWERS ?? '').split(',').filter(Boolean);
  const required = (process.env.FACTORY_REQUIRED_CHECKS ?? 'check,image,backup,e2e').split(',');
  const p = gh(`repos/${repo}/pulls/${pr}`) as { draft: boolean; mergeable: boolean | null; user: { login: string }; head: { sha: string } };
  const files = (gh(`repos/${repo}/pulls/${pr}/files?per_page=100`) as { filename: string }[]).map((f) => f.filename);
  const runs = gh(`repos/${repo}/commits/${p.head.sha}/check-runs?per_page=100`) as { check_runs: { name: string; conclusion: Check['conclusion'] }[] };
  const reviews = (gh(`repos/${repo}/pulls/${pr}/reviews?per_page=100`) as { user: { login: string }; state: Review['state']; commit_id: string }[]).map(
    (r) => ({ user: r.user.login, state: r.state, commitId: r.commit_id }),
  );
  const risk = classifyRisk(files, parseLevel(arg('suggested')));
  const decision = decideMerge({
    level: risk.level,
    author: p.user.login,
    headSha: p.head.sha,
    draft: p.draft,
    mergeable: p.mergeable,
    checks: runs.check_runs.map((c) => ({ name: c.name, conclusion: c.conclusion })),
    requiredChecks: required,
    reviews,
    owner,
    reviewers,
  });
  console.log(JSON.stringify({ level: risk.level, ...decision }, null, 2));
  if (!decision.allow) process.exit(1);
  if (rest.includes('--execute')) {
    execFileSync('gh', ['api', '-X', 'PUT', `repos/${repo}/pulls/${pr}/merge`, '-f', 'merge_method=squash', '-f', `sha=${p.head.sha}`], { stdio: 'inherit' });
  }
} else {
  console.error('Uso: cli.ts risk|gates|merge [opciones]');
  process.exit(2);
}
