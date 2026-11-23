// What gets copied and generated. The installer only ever adds files: it never overwrites or deletes.
import { execFileSync } from 'node:child_process';
import { chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { effectiveCommands, resolveProfile } from '../stack/profiles.ts';
import type { Case } from './detect.ts';

// Pieces of the factory that go into an existing project (its own app code is not ours to touch).
export const EXISTING_PARTS = ['CLAUDE.md', 'AGENTS.md', '.claude/agents/', 'docs/rules/', 'docs/templates/', 'docs/limits.md', 'scripts/', 'workflows/', 'evals/', 'product.config.example.yaml'];
// Factory-specific material that does not belong in a new product.
export const NEW_EXCLUDES = ['docs/specs/', 'docs/lessons/', 'README.md', '.factory-state/'];
// Never part of a kit, whatever lists it: local secrets and keys of whoever runs the installer.
export const SECRET_FILE = /(^|\/)(\.env(\.(?!example$)[^/]+)?|\.npmrc|\.ssh(\/.*)?|[^/]+\.(pem|key|p12|pfx))$/;
// Allowlist of top-level entries a kit may contain (blocklists always miss something: .aws, .netrc, *.tfvars...).
export const KIT_TOP = new Set(['.claude', '.dockerignore', '.env.example', '.github', '.gitignore', '.gitleaks.toml', 'AGENTS.md', 'CLAUDE.md', 'README.md', 'apps', 'docs', 'evals', 'infra', 'package.json', 'packages', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'product.config.example.yaml', 'scripts', 'workflows']);
// What the installer itself may leave at the top level of a new product.
const GENERATED_TOP = new Set(['.git', '.env', '.factory-kit.json', '.factory-state', 'node_modules', 'product.config.yaml', 'docs']);
export const foreignEntries = (target: string): string[] => readdirSync(target).filter((e) => !KIT_TOP.has(e) && !GENERATED_TOP.has(e) && e !== '.DS_Store');
const WALK_IGNORE = new Set(['node_modules', '.git', '.factory-state', 'dist', '.next', 'coverage', 'test-results', 'playwright-report']);
export const CONFLICT_RENAMES: Record<string, string> = { 'CLAUDE.md': 'CLAUDE.factory.md', 'AGENTS.md': 'AGENTS.factory.md' };

export function gitFiles(root: string): string[] {
  try {
    return execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
  } catch {
    const out: string[] = []; // a zip download has no git: walk the tree instead
    const walk = (dir: string) => {
      for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
        if (WALK_IGNORE.has(e.name) || e.isSymbolicLink()) continue;
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) walk(rel);
        else out.push(rel);
      }
    };
    walk('');
    return out;
  }
}

const inParts = (f: string, parts: string[]) => parts.some((p) => (p.endsWith('/') ? f.startsWith(p) : f === p));

export function listKitFiles(sourceRoot: string, kind: Exclude<Case, 'instalada'>, files: string[] = gitFiles(sourceRoot)): string[] {
  const plain = (f: string) => {
    if (SECRET_FILE.test(f) || !KIT_TOP.has(f.split('/')[0]!)) return false;
    try {
      return !lstatSync(join(sourceRoot, f)).isSymbolicLink(); // a link in the kit would be copied as the content of whatever it points to
    } catch {
      return true;
    }
  };
  files = files.filter(plain);
  const kept = kind === 'existente' ? files.filter((f) => inParts(f, EXISTING_PARTS)) : files.filter((f) => !inParts(f, NEW_EXCLUDES));
  return kept.sort();
}

export interface CopyPlan {
  copy: { from: string; to: string }[];
  same: string[]; // already there with identical content
  renamed: { from: string; to: string }[]; // factory CLAUDE.md/AGENTS.md saved beside the project's own
  skipped: string[]; // different content already there: kept untouched
}

// A path is safe when no existing component under the target is a symbolic link (including a dangling one):
// writing through a link would land outside the target or on a file that is not ours.
export function lexists(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

export function isSafePath(target: string, rel: string): boolean {
  const root = resolve(target);
  const full = resolve(root, rel);
  if (full !== root && !full.startsWith(root + sep)) return false;
  let cur = root;
  for (const part of rel.split('/').filter(Boolean)) {
    cur = join(cur, part);
    if (!lexists(cur)) return true; // nothing below a missing component can be a link
    if (lstatSync(cur).isSymbolicLink()) return false;
  }
  return true;
}

export function planCopy(sourceRoot: string, target: string, files: string[]): CopyPlan {
  const plan: CopyPlan = { copy: [], same: [], renamed: [], skipped: [] };
  for (const f of files) {
    const dest = join(target, f);
    if (!isSafePath(target, f)) {
      plan.skipped.push(f); // symbolic link in the way: never written through
      continue;
    }
    if (!existsSync(dest)) {
      plan.copy.push({ from: f, to: f });
      continue;
    }
    if (readFileSync(join(sourceRoot, f)).equals(readFileSync(dest))) {
      plan.same.push(f);
      continue;
    }
    const alt = CONFLICT_RENAMES[f];
    if (alt && !existsSync(join(target, alt))) plan.renamed.push({ from: f, to: alt });
    else plan.skipped.push(f);
  }
  return plan;
}

export function applyCopy(sourceRoot: string, target: string, plan: CopyPlan): void {
  for (const { from, to } of [...plan.copy, ...plan.renamed]) {
    if (!isSafePath(target, to)) throw new Error(`ruta insegura (enlace simbólico en el destino): ${to}`);
    const dest = join(target, to);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(sourceRoot, from), dest, constants.COPYFILE_EXCL); // exclusive: a link planted after the check cannot be followed
    chmodSync(dest, statSync(join(sourceRoot, from)).mode & 0o111 ? 0o755 : 0o644); // normalized: no group/other write bits
  }
}

// Writes only when absent. Returns true when the file was created.
export function writeIfAbsent(target: string, rel: string, content: string, mode?: number): boolean {
  if (!isSafePath(target, rel)) throw new Error(`ruta insegura (enlace simbólico en el destino): ${rel}`);
  const path = join(target, rel);
  if (lexists(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, { mode: mode ?? 0o644, flag: 'wx' });
  return true;
}

export interface ConfigInput {
  kind: Exclude<Case, 'instalada'>;
  name: string;
  type: 'saas' | 'custom';
  rootFiles: string[];
  configuredProfile: string | null;
}

// The config states only what the installer knows; everything else keeps the example's questions for the owner.
export function productConfig(i: ConfigInput): string {
  const lines = [
    '# Generado por el instalador. Solo el dueño confirma estos valores; los agentes no asumen los que falten.',
    `name: ${JSON.stringify(i.name)}`,
    `type: ${i.type}`,
  ];
  if (i.kind === 'nuevo') {
    if (i.type === 'saas') lines.push('validation: pending   # el dueño aprueba nicho y MVP antes del primer ticket');
    lines.push('origin: new', 'stack: default');
  } else {
    const stack = resolveProfile(i.configuredProfile, i.rootFiles);
    const cmds = effectiveCommands(stack, i.rootFiles, null);
    lines.push('origin: existing      # exige completar la incorporación antes del primer ticket', 'stack: custom');
    lines.push(`stack_profile: ${stack === 'desconocido' ? 'auto' : stack}`);
    lines.push('commands:             # revisa y corrige: son valores por defecto del perfil detectado');
    for (const [k, v] of Object.entries(cmds)) lines.push(`  ${k}: ${JSON.stringify(v)}`);
    if (Object.keys(cmds).length === 0) lines.push('  # sin perfil detectado: declara install, build, test, coverage (test es obligatorio)');
  }
  lines.push('work_tracker: github', 'repo_host: github', 'ci: github-actions', 'cloud: none', 'market: do', 'data_kind: personal', 'autonomy: low-first');
  return `${lines.join('\n')}\n`;
}

export function productReadme(name: string): string {
  return `# ${name}\n\nProducto creado con la fábrica de software. Antes de programar: lee \`CLAUDE.md\` y \`product.config.yaml\`.\n\n- Desarrollo local: \`pnpm --filter @factory/web dev\` (el instalador ya dejó \`.env\` y la base de datos).\n- Puertas: \`pnpm --silent --filter @factory/scripts gates --base origin/main --worktree --state .factory-state/g.json\`.\n- Siguiente paso: validar el nicho (\`docs/discovery/\`) y aprobar \`validation: approved\` en \`product.config.yaml\`.\n`;
}

// Random development secrets: the values from .env.example are placeholders and must never be used as they are.
export function renderEnv(example: string, databaseUrl: string, rand: (n: number) => Buffer = randomBytes): string {
  const set: Record<string, string> = {
    DATABASE_URL: databaseUrl,
    AUTH_SECRET: rand(32).toString('base64'),
    MFA_ENCRYPTION_KEY: rand(32).toString('base64'),
    METRICS_TOKEN: rand(24).toString('hex'),
  };
  return example
    .split('\n')
    .map((line) => {
      const key = /^([A-Z_]+)=/.exec(line)?.[1];
      return key && key in set ? `${key}=${set[key]}` : line;
    })
    .join('\n');
}

export const FACTORY_WRAPPER = `#!/bin/sh
# Atajo de la fábrica para proyectos existentes: ./factory <risk|gates|merge|factory|rollout|onboard> [args]
# Corre desde la raíz del proyecto (el directorio actual es el que mira la fábrica).
set -e
cmd="$1"; [ $# -gt 0 ] && shift
bin="scripts/node_modules/.bin/tsx"
case "$cmd" in
  risk|gates|merge) exec "$bin" scripts/src/cli.ts "$cmd" "$@" ;;
  factory) exec "$bin" scripts/src/factory/cli.ts "$@" ;;
  rollout) exec "$bin" scripts/src/deploy/cli.ts "$@" ;;
  onboard) exec "$bin" scripts/src/onboard/cli.ts "$@" ;;
  *) echo "uso: ./factory <risk|gates|merge|factory|rollout|onboard> [args]" >&2; exit 2 ;;
esac
`;

// Marker files for stack detection: the project root and one level down (enough for profiles, and cheap on huge trees).
export function rootLevelFiles(root: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isFile()) out.push(e.name);
    else if (e.isDirectory() && !WALK_IGNORE.has(e.name) && !e.name.startsWith('.')) {
      for (const c of readdirSync(join(root, e.name), { withFileTypes: true })) if (c.isFile()) out.push(`${e.name}/${c.name}`);
    }
  }
  return out;
}

// Installs get what package managers need (PATH, HOME, proxies, registries, CA bundles), not cloud or GitHub tokens.
export function installEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const keep = /^(PATH|HOME|USER|LANG|TMPDIR|CI|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR|REQUESTS_CA_BUNDLE|(HTTPS?|NO|ALL)_PROXY|npm_config_.+|NPM_CONFIG_.+|PNPM_HOME|COREPACK_.+|DOCKER_(HOST|CONTEXT|CONFIG|CERT_PATH|TLS_VERIFY)|XDG_RUNTIME_DIR)$/i;
  return Object.fromEntries(Object.entries(env).filter(([k]) => keep.test(k)));
}
