// Deterministic inventory of an existing project. Reads files only; never executes project code.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { resolveProfile, type StackProfile } from '../stack/profiles.ts';
import { readStackConfig } from '../stack/commands.ts';

export interface Profile {
  root: string;
  stack: StackProfile;
  rootFiles: string[]; // files at depth <= 2: enough to choose default commands without storing the whole tree
  packageManager: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
  languages: Record<string, number>;
  frameworks: string[];
  scripts: Record<string, string>;
  testRunner: 'vitest' | 'jest' | 'playwright' | 'pytest' | 'dotnet-test' | 'junit' | 'none';
  testFiles: number;
  sourceFiles: number;
  hasDocker: boolean;
  ci: string[];
  migrations: string[];
  debtMarkers: number;
  criticalCandidates: Record<string, string[]>;
  monorepo: boolean;
}

const IGNORED = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turbo', '.factory-state', 'out', '.venv', 'venv', '__pycache__', 'obj', 'target', '.gradle', '.vs', '.idea']);
const LANGS: Record<string, string> = { '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.py': 'python', '.go': 'go', '.rb': 'ruby', '.php': 'php', '.java': 'java', '.kt': 'kotlin', '.cs': 'csharp', '.rs': 'rust', '.sql': 'sql' };
const FRAMEWORKS = ['next', 'react', 'vue', 'svelte', 'express', 'fastify', '@nestjs/core', 'prisma', 'drizzle-orm', 'typeorm', 'sequelize', 'mongoose', 'next-auth', '@clerk/nextjs', 'stripe', 'tailwindcss'];
const CRITICAL: Record<string, RegExp> = {
  autenticacion: /(^|\/)(auth|login|signup|session|mfa|password)[^/]*/i,
  pagos: /(payment|billing|checkout|invoice|stripe|azul|subscription)/i,
  permisos: /(permission|rbac|roles?|authz|policy)/i,
  'datos-personales': /(privacy|gdpr|consent|profile|export)/i,
  'flujo-principal': /(^|\/)(dashboard|orders?|checkout|booking|reports?)\b/i,
};
const TEST_FILE = new RegExp(
  [
    '\\.test\\.', '\\.spec\\.', '(^|/)__tests__/', '(^|/)tests?/.+\\.(py|go|rb)$', '_test\\.go$',
    '(^|/)test_[^/]+\\.py$', '_test\\.py$', '(^|/)conftest\\.py$', // python
    '(Tests?|Spec)\\.(cs|fs)$', '\\.Tests?/', // dotnet
    '(Test|Tests|IT)\\.(java|kt)$', '(^|/)src/test/', // jvm
  ].join('|'),
);
const SOURCE_EXT = new Set(Object.keys(LANGS).filter((e) => e !== '.sql'));

export function walk(root: string, limit = 20000): string[] {
  const out: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (out.length >= limit) return;
      if (IGNORED.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else out.push(relative(root, full));
    }
  };
  visit(root);
  return out;
}

function readPackage(root: string): { deps: Set<string>; scripts: Record<string, string> } {
  const p = join(root, 'package.json');
  if (!existsSync(p)) return { deps: new Set(), scripts: {} };
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as { dependencies?: object; devDependencies?: object; scripts?: Record<string, string> };
    return { deps: new Set([...Object.keys(j.dependencies ?? {}), ...Object.keys(j.devDependencies ?? {})]), scripts: j.scripts ?? {} };
  } catch {
    return { deps: new Set(), scripts: {} };
  }
}

// Frameworks of non-Node stacks are recognised from manifest text (read as data, never executed).
const MANIFEST_FRAMEWORKS: [string, RegExp][] = [
  ['django', /\bdjango\b/i], ['fastapi', /\bfastapi\b/i], ['flask', /\bflask\b/i], ['sqlalchemy', /\bsqlalchemy\b/i],
  ['aspnetcore', /Microsoft\.AspNetCore|Sdk="Microsoft\.NET\.Sdk\.Web"/], ['entityframework', /EntityFramework/],
  ['spring-boot', /spring-boot/i], ['hibernate', /hibernate/i],
];
function manifestFrameworks(root: string, files: string[]): string[] {
  const manifests = files.filter((f) => f.split('/').length <= 2 && /(^|\/)(pyproject\.toml|requirements[^/]*\.txt|Pipfile|pom\.xml|build\.gradle(\.kts)?|[^/]+\.(csproj|fsproj))$/.test(f));
  const text = manifests.map((f) => (statSync(join(root, f)).size < 400_000 ? readFileSync(join(root, f), 'utf8') : '')).join('\n');
  return MANIFEST_FRAMEWORKS.filter(([, rx]) => rx.test(text)).map(([name]) => name);
}

export function scanProject(root: string): Profile {
  const files = walk(root);
  const pkg = readPackage(root);
  const languages: Record<string, number> = {};
  let sourceFiles = 0;
  let testFiles = 0;
  let debtMarkers = 0;
  const critical: Record<string, string[]> = {};
  for (const f of files) {
    const ext = extname(f);
    const lang = LANGS[ext];
    if (lang) languages[lang] = (languages[lang] ?? 0) + 1;
    const isTest = TEST_FILE.test(f);
    if (isTest) testFiles += 1;
    else if (SOURCE_EXT.has(ext)) {
      sourceFiles += 1;
      const size = statSync(join(root, f)).size;
      if (size < 400_000 && /TODO|FIXME|HACK|XXX/.test(readFileSync(join(root, f), 'utf8'))) debtMarkers += 1;
      for (const [flow, rx] of Object.entries(CRITICAL)) if (rx.test(f)) (critical[flow] ??= []).push(f);
    }
  }
  const has = (name: string) => files.includes(name);
  const packageManager = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : has('package-lock.json') ? 'npm' : 'unknown';
  const stack = resolveProfile(readStackConfig(root).profile, files);
  const nodeRunner = pkg.deps.has('vitest') ? 'vitest' : pkg.deps.has('jest') ? 'jest' : pkg.deps.has('@playwright/test') ? 'playwright' : 'none';
  const testRunner = nodeRunner !== 'none' ? nodeRunner : testFiles === 0 ? 'none' : stack === 'python' ? 'pytest' : stack === 'dotnet' ? 'dotnet-test' : stack === 'jvm' ? 'junit' : 'none';
  return {
    root,
    stack,
    rootFiles: files.filter((f) => f.split('/').length <= 2),
    packageManager,
    languages,
    frameworks: [...FRAMEWORKS.filter((f) => pkg.deps.has(f)), ...manifestFrameworks(root, files)],
    scripts: pkg.scripts,
    testRunner,
    testFiles,
    sourceFiles,
    hasDocker: files.some((f) => /(^|\/)Dockerfile/.test(f) || /docker-compose/.test(f)),
    ci: files.filter((f) => /^\.github\/workflows\/|^azure-pipelines|^\.gitlab-ci|^Jenkinsfile/.test(f)),
    migrations: files.filter((f) => /(^|\/)(migrations|Migrations|drizzle|prisma\/migrations|alembic\/versions|db\/migrate|db\/migration)\//.test(f)).slice(0, 20),
    debtMarkers,
    criticalCandidates: critical,
    monorepo: has('pnpm-workspace.yaml') || has('turbo.json') || has('lerna.json') || files.filter((f) => /^(apps|packages)\/[^/]+\/package\.json$/.test(f)).length > 1,
  };
}
