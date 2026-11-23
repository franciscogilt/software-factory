import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Runner } from '../onboard/checks.ts';
import { readStackConfig } from '../stack/commands.ts';
import { localPrepare, parseDbUrl } from './database.ts';
import { chooseDb, detectCase, doctor, MARKER, sanitizeName } from './detect.ts';
import { listKitFiles, planCopy, productConfig, renderEnv } from './kit.ts';
import { bootstrap, type Options } from './run.ts';

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'inst-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}
const KIT = {
  'CLAUDE.md': '# factory', 'AGENTS.md': '# agents', 'README.md': '# factory readme', 'pnpm-lock.yaml': 'lock', '.env.example': 'DATABASE_URL=x\nAUTH_SECRET=placeholder\nMFA_ENCRYPTION_KEY=\nMETRICS_TOKEN=\nAPP_CURRENCY=DOP\n',
  '.claude/agents/revisor.md': 'r', 'docs/rules/stack.md': 's', 'docs/templates/spec.md': 't', 'docs/limits.md': 'l', 'docs/specs/factory-only.md': 'spec', 'docs/lessons/x.md': 'x',
  'scripts/package.json': '{"name":"@factory/scripts"}', 'scripts/src/cli.ts': 'c', 'workflows/a.WORKFLOW.md': 'w', 'evals/a.json': '{}', 'apps/web/src/page.tsx': 'p', 'infra/docker-compose.yml': 'c', 'product.config.example.yaml': 'e',
};
const ok = { status: 0, timedOut: false, output: '', ms: 1 };
const recorder = (answers: (cmd: string, args: string[]) => Partial<typeof ok> = () => ({})) => {
  const calls: string[] = [];
  const run: Runner = (cmd, args) => (calls.push(`${cmd} ${args.join(' ')}`), { ...ok, ...answers(cmd, args) });
  return { calls, run };
};
const base = (source: string, target: string, extra: Partial<Options> = {}): Options => ({ target, sourceRoot: source, db: 'local', type: 'saas', dryRun: false, force: false, sleep: () => {}, nodeVersion: 'v22.1.0', version: 'abc', rootFiles: () => ['requirements.txt', 'app.py'], ...extra });

describe('detection', () => {
  it('empty or missing folder is new, folder with files is existing, marker means installed', () => {
    expect(detectCase(join(tmpdir(), 'no-existe-xyz'))).toBe('nuevo');
    expect(detectCase(tree({ '.git/HEAD': 'x', '.DS_Store': '' }))).toBe('nuevo');
    expect(detectCase(tree({ 'app.py': 'x' }))).toBe('existente');
    expect(detectCase(tree({ [MARKER]: '{}', 'app.py': 'x' }))).toBe('instalada');
  });
  it('sanitizes names for SQL identifiers and rejects unsafe database names', () => {
    expect(sanitizeName('Mi Agenda; DROP TABLE')).toBe('mi_agenda_drop_table');
    expect(sanitizeName('123app')).toBe('p_123app');
    expect(sanitizeName('$$$')).toBe('producto');
    expect(() => parseDbUrl('postgres://u:p@h:5432/a"b;x')).toThrow(/nombre de la base/);
    expect(() => parseDbUrl('mysql://u@h/db')).toThrow(/postgres/);
    expect(parseDbUrl('postgres://us%40r:p%3Aw@h:5433/mi_db')).toMatchObject({ user: 'us@r', password: 'p:w', port: '5433', database: 'mi_db' });
  });
});

describe('doctor', () => {
  it('reports every missing tool with a hint for the platform, before anything is copied', () => {
    const { run } = recorder(() => ({ status: 1 }));
    const p = doctor({ case: 'nuevo', db: 'docker', platform: 'darwin', nodeVersion: 'v20.1.0', run });
    expect(p.map((x) => x.tool)).toEqual(['node', 'pnpm', 'git', 'docker']);
    expect(p.find((x) => x.tool === 'docker')?.fix).toContain('Docker Desktop');
    expect(doctor({ case: 'nuevo', db: 'local', platform: 'linux', nodeVersion: 'v22.0.0', run }).map((x) => x.tool)).toContain('psql');
  });
  it('an existing project only needs node and pnpm; everything present is no problem', () => {
    const { run } = recorder();
    expect(doctor({ case: 'existente', db: 'local', nodeVersion: 'v22.0.0', run })).toEqual([]);
    expect(doctor({ case: 'nuevo', db: 'docker', nodeVersion: 'v24.0.0', run })).toEqual([]);
  });
  it('auto picks docker only when it answers', () => {
    expect(chooseDb(recorder().run)).toBe('docker');
    expect(chooseDb(recorder(() => ({ status: 1 })).run)).toBe('local');
  });
});

describe('kit selection and copy plan', () => {
  const src = tree(KIT);
  it('new product: whole kit minus the factory own specs, lessons and README', () => {
    const f = listKitFiles(src, 'nuevo', Object.keys(KIT));
    expect(f).toContain('apps/web/src/page.tsx');
    expect(f).toContain('pnpm-lock.yaml');
    expect(f).not.toContain('docs/specs/factory-only.md');
    expect(f).not.toContain('docs/lessons/x.md');
    expect(f).not.toContain('README.md');
  });
  it('existing project: only the factory parts, never app code or infra', () => {
    const f = listKitFiles(src, 'existente', Object.keys(KIT));
    expect(f).toEqual(expect.arrayContaining(['CLAUDE.md', '.claude/agents/revisor.md', 'scripts/package.json', 'workflows/a.WORKFLOW.md', 'evals/a.json']));
    expect(f).not.toContain('apps/web/src/page.tsx');
    expect(f).not.toContain('infra/docker-compose.yml');
    expect(f).not.toContain('pnpm-lock.yaml');
  });
  it('never overwrites: identical stays, different is kept, CLAUDE.md gets a .factory.md copy', () => {
    const target = tree({ 'CLAUDE.md': 'del proyecto', 'docs/limits.md': 'l', 'docs/rules/stack.md': 'distinto', 'AGENTS.md': 'propio', 'AGENTS.factory.md': 'ya hay' });
    const plan = planCopy(src, target, listKitFiles(src, 'existente', Object.keys(KIT)));
    expect(plan.same).toEqual(['docs/limits.md']);
    expect(plan.renamed).toEqual([{ from: 'CLAUDE.md', to: 'CLAUDE.factory.md' }]);
    expect(plan.skipped).toEqual(expect.arrayContaining(['docs/rules/stack.md', 'AGENTS.md']));
    expect(plan.copy.map((c) => c.to)).toContain('scripts/package.json');
  });
});

describe('generated files', () => {
  it('.env gets random secrets, keeps the rest, and never the placeholder', () => {
    const rand = (n: number) => Buffer.alloc(n, 7);
    const env = renderEnv(KIT['.env.example'], 'postgres://a:b@h/db', rand);
    expect(env).toContain('DATABASE_URL=postgres://a:b@h/db');
    expect(env).not.toContain('placeholder');
    expect(env).toMatch(/AUTH_SECRET=[A-Za-z0-9+/=]{40,}/);
    expect(env).toMatch(/METRICS_TOKEN=[0-9a-f]{48}/);
    expect(env).toContain('APP_CURRENCY=DOP');
    expect(renderEnv(KIT['.env.example'], 'u')).not.toBe(renderEnv(KIT['.env.example'], 'u')); // real randomness
  });
  it('config for a new SaaS is pending validation; for an existing project it carries explicit commands the reader accepts', () => {
    expect(productConfig({ kind: 'nuevo', name: 'agenda', type: 'saas', rootFiles: [], configuredProfile: null })).toMatch(/validation: pending[\s\S]*origin: new/);
    const text = productConfig({ kind: 'existente', name: 'x', type: 'custom', rootFiles: ['requirements.txt', 'app.py'], configuredProfile: null });
    expect(text).toContain('origin: existing');
    expect(text).not.toContain('validation');
    const root = tree({ 'product.config.yaml': text });
    const cfg = readStackConfig(root);
    expect(cfg.profile).toBe('python');
    expect(cfg.commands?.test).toContain('pytest');
  });
});

describe('bootstrap', () => {
  it('dry run writes nothing and runs no install/db commands', () => {
    const target = join(tmpdir(), `dry-${Date.now()}`);
    const { calls, run } = recorder();
    const r = bootstrap(base(tree(KIT), target, { dryRun: true, run }));
    expect(r.ok).toBe(true);
    expect(r.plan?.copy.length).toBeGreaterThan(5);
    expect(existsSync(target)).toBe(false);
    expect(calls.filter((c) => /install|compose|migrate|create database/.test(c))).toEqual([]);
  });
  it('missing tools stop everything before the first file is copied', () => {
    const target = join(tmpdir(), `miss-${Date.now()}`);
    const r = bootstrap(base(tree(KIT), target, { run: recorder(() => ({ status: 1 })).run }));
    expect(r.ok).toBe(false);
    expect(r.failed).toContain('faltan herramientas');
    expect(existsSync(target)).toBe(false);
  });
  it('new product, local db: copies, writes config/.env/readme, installs, prepares db, migrates, marks complete', () => {
    const target = join(tmpdir(), `new-${Date.now()}`);
    const { calls, run } = recorder((cmd, args) => (cmd === 'psql' && args.join(' ').includes('pg_database') ? { output: '' } : {}));
    const r = bootstrap(base(tree(KIT), target, { run, databaseUrl: 'postgres://u:p@localhost:5432/agenda' }));
    expect(r.ok, r.failed ?? '').toBe(true);
    expect(JSON.parse(readFileSync(join(target, MARKER), 'utf8'))).toMatchObject({ mode: 'nuevo', complete: true });
    expect(readFileSync(join(target, 'product.config.yaml'), 'utf8')).toContain('validation: pending');
    expect(readFileSync(join(target, '.env'), 'utf8')).toContain('DATABASE_URL=postgres://u:p@localhost:5432/agenda');
    expect(statSync(join(target, '.env')).mode & 0o777).toBe(0o600);
    expect(existsSync(join(target, 'docs/specs/factory-only.md'))).toBe(false);
    expect(existsSync(join(target, 'docs/specs/.gitkeep'))).toBe(true);
    expect(calls).toEqual(expect.arrayContaining(['git init -q -b main', 'pnpm install --frozen-lockfile', 'pnpm --filter @factory/db migrate']));
    expect(calls.some((c) => c.startsWith('psql') && c.includes('create database "agenda"'))).toBe(true);
    expect(r.done.join('\n')).not.toMatch(/AUTH_SECRET=/);
  });
  it('docker mode starts only db and mail from compose, waits for readiness and then migrates', () => {
    const target = join(tmpdir(), `dock-${Date.now()}`);
    let ready = 0;
    const { calls, run } = recorder((cmd, args) => (args.includes('pg_isready') ? { status: ++ready < 3 ? 1 : 0 } : {}));
    const r = bootstrap(base(tree(KIT), target, { db: 'docker', run }));
    expect(r.ok, r.failed ?? '').toBe(true);
    expect(calls).toContain('docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up -d db mail');
    expect(ready).toBe(3);
    expect(readFileSync(join(target, '.env'), 'utf8')).toContain('postgres://factory:factory@localhost:5432/factory');
  });
  it('docker that never gets ready fails with the reason and the marker stays incomplete', () => {
    const target = join(tmpdir(), `dockfail-${Date.now()}`);
    const r = bootstrap(base(tree(KIT), target, { db: 'docker', run: recorder((_c, a) => (a.includes('pg_isready') ? { status: 1 } : {})).run }));
    expect(r.ok).toBe(false);
    expect(r.failed).toContain('no estuvo listo');
    expect(JSON.parse(readFileSync(join(target, MARKER), 'utf8')).complete).toBe(false);
  });
  it('a failed step is resumable: the second run finishes without overwriting what exists', () => {
    const target = join(tmpdir(), `resume-${Date.now()}`);
    const src = tree(KIT);
    const first = bootstrap(base(src, target, { db: 'docker', run: recorder((_c, a) => (a.includes('pg_isready') ? { status: 1 } : {})).run }));
    expect(first.ok).toBe(false);
    const env1 = readFileSync(join(target, '.env'), 'utf8');
    writeFileSync(join(target, 'product.config.yaml'), 'name: editado\n');
    const second = bootstrap(base(src, target, { db: 'docker', run: recorder().run }));
    expect(second.ok, second.failed ?? '').toBe(true);
    expect(readFileSync(join(target, '.env'), 'utf8')).toBe(env1);
    expect(readFileSync(join(target, 'product.config.yaml'), 'utf8')).toBe('name: editado\n');
  });
  it('a finished installation is refused, --force only adds the missing', () => {
    const target = join(tmpdir(), `done-${Date.now()}`);
    const src = tree(KIT);
    expect(bootstrap(base(src, target, { run: recorder().run })).ok).toBe(true);
    const again = bootstrap(base(src, target, { run: recorder().run }));
    expect(again.ok).toBe(false);
    expect(again.failed).toContain('--force');
    const forced = bootstrap(base(src, target, { run: recorder().run, force: true }));
    expect(forced.ok).toBe(true);
    expect(forced.plan?.copy).toEqual([]);
  });
  it('existing project: adds only factory files, leaves theirs untouched, detects the stack and starts onboarding', () => {
    const target = tree({ 'app.py': 'print(1)', 'requirements.txt': 'flask', 'CLAUDE.md': 'mio', '.gitignore': 'x' });
    const before = Object.fromEntries(['app.py', 'requirements.txt', 'CLAUDE.md', '.gitignore'].map((f) => [f, readFileSync(join(target, f), 'utf8')]));
    const { calls, run } = recorder();
    const r = bootstrap(base(tree(KIT), target, { run, rootFiles: () => ['requirements.txt', 'app.py'] }));
    expect(r.ok, r.failed ?? '').toBe(true);
    for (const [f, c] of Object.entries(before)) expect(readFileSync(join(target, f), 'utf8')).toBe(c);
    expect(existsSync(join(target, 'CLAUDE.factory.md'))).toBe(true);
    expect(existsSync(join(target, 'apps'))).toBe(false);
    expect(existsSync(join(target, '.env'))).toBe(false);
    const cfg = readFileSync(join(target, 'product.config.yaml'), 'utf8');
    expect(cfg).toContain('origin: existing');
    expect(cfg).toContain('stack_profile: python');
    expect(statSync(join(target, 'factory')).mode & 0o111).not.toBe(0);
    expect(calls).toContain('pnpm install --ignore-workspace');
    expect(calls.some((c) => c.includes('onboard/cli.ts init'))).toBe(true);
    expect(calls.some((c) => /psql|compose|migrate/.test(c))).toBe(false);
    expect(r.next.join(' ')).toContain('PR');
  });
  it('an existing project with its own scripts/package.json stops before copying anything', () => {
    const target = tree({ 'app.py': 'x', 'scripts/package.json': '{"name":"suyo"}' });
    const r = bootstrap(base(tree(KIT), target, { run: recorder().run }));
    expect(r.ok).toBe(false);
    expect(r.failed).toContain('scripts/package.json');
    expect(existsSync(join(target, '.claude'))).toBe(false);
    expect(existsSync(join(target, MARKER))).toBe(false);
  });
  it('invalid database url stops before installing dependencies', () => {
    const target = join(tmpdir(), `badurl-${Date.now()}`);
    const { calls, run } = recorder();
    const r = bootstrap(base(tree(KIT), target, { run, databaseUrl: 'postgres://u:p@h/a;b' }));
    expect(r.ok).toBe(false);
    expect(calls.some((c) => c.startsWith('pnpm install'))).toBe(false);
  });
});

describe('review fixes', () => {
  it('refuses a target that is, contains or sits inside the factory clone', () => {
    const src = tree(KIT);
    for (const target of [src, join(src, 'sub', 'prod'), dirname(src)]) {
      const r = bootstrap(base(src, target, { run: recorder().run }));
      expect(r.ok, target).toBe(false);
      expect(r.failed).toContain('coincide');
    }
    expect(existsSync(join(src, 'sub'))).toBe(false);
  });
  it('an unreadable marker is refused, never guessed from the folder contents', () => {
    const target = tree({ [MARKER]: '{ roto', 'app.py': 'x' });
    const r = bootstrap(base(tree(KIT), target, { run: recorder().run }));
    expect(r.ok).toBe(false);
    expect(r.failed).toContain(MARKER);
    expect(existsSync(join(target, 'CLAUDE.md'))).toBe(false);
  });
  it('a run cut after the marker but before the end resumes as a NEW product, not as existing', () => {
    const src = tree(KIT);
    const target = tree({ [MARKER]: JSON.stringify({ mode: 'nuevo', complete: false, version: 'x', db: 'local', installedAt: 'now' }), 'CLAUDE.md': '# factory', 'apps/web/src/page.tsx': 'p' });
    const r = bootstrap(base(src, target, { run: recorder().run }));
    expect(r.ok, r.failed ?? '').toBe(true);
    expect(r.kind).toBe('nuevo');
    expect(existsSync(join(target, '.env'))).toBe(true);
    expect(existsSync(join(target, 'factory'))).toBe(false);
  });
  it('paths with spaces work and the next step quotes them', () => {
    const target = join(mkdtempSync(join(tmpdir(), 'con espacio-')), 'mi producto');
    const r = bootstrap(base(tree(KIT), target, { run: recorder().run }));
    expect(r.ok, r.failed ?? '').toBe(true);
    expect(r.next[0]).toBe(`cd ${JSON.stringify(target)}`);
  });
  it('dry run lists the steps it would take', () => {
    const r = bootstrap(base(tree(KIT), join(tmpdir(), `dry2-${Date.now()}`), { dryRun: true, run: recorder().run }));
    expect(r.done.length).toBeGreaterThan(3);
  });
  it('warns when scripts/ already existed and when .env is kept', () => {
    const target = tree({ 'app.py': 'x', 'scripts/deploy.sh': 'x' });
    const r = bootstrap(base(tree(KIT), target, { run: recorder().run }));
    expect(r.done.join('\n')).toContain('ya tenía una carpeta scripts/');
  });
});

describe('localPrepare', () => {
  it('explains how to create the role when the connection fails, and never puts the password in arguments', () => {
    const seen: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
    const run: Runner = (_c, args, _cwd, env) => (seen.push({ args, env }), { ...ok, status: 2, output: 'password authentication failed' });
    const r = localPrepare(run, '.', 'postgres://dueno:secreto@localhost:5432/mi_db');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('CREATE ROLE dueno');
    expect(JSON.stringify(seen.map((s) => s.args))).not.toContain('secreto');
    expect(seen[0]!.env.PGPASSWORD).toBe('secreto');
  });
});
