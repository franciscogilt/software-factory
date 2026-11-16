// Deterministic risk classification by touched files. Agents can raise the level, never lower it.
export type Level = 'bajo' | 'medio' | 'alto';

export interface Classification {
  level: Level;
  reasons: string[];
}

const ORDER: Record<Level, number> = { bajo: 0, medio: 1, alto: 2 };

export function maxLevel(a: Level, b: Level): Level {
  return ORDER[a] >= ORDER[b] ? a : b;
}

interface Rule {
  level: Level;
  reason: string;
  test: RegExp;
}

// First matching rule wins per file. High-risk rules come first so they cannot be shadowed.
const RULES: Rule[] = [
  { level: 'alto', reason: 'migraciones', test: /^packages\/db\/(migrations|drizzle)\// },
  { level: 'alto', reason: 'migraciones', test: /(^|\/)(alembic\/versions|[Mm]igrations|db\/migrate|db\/migration|src\/main\/resources\/db\/(migration|changelog))\// },
  { level: 'alto', reason: 'configuración del producto (comandos de las puertas y stack)', test: /^product\.config\.yaml$/ },
  { level: 'alto', reason: 'infraestructura', test: /^infra\// },
  { level: 'alto', reason: 'CI/CD', test: /^\.github\// },
  { level: 'alto', reason: 'contenedores', test: /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml)$/ },
  { level: 'alto', reason: 'reglas de la fábrica', test: /^(CLAUDE\.md|AGENTS\.md|docs\/rules\/|\.claude\/|evals\/|docs\/limits\.md)/ },
  { level: 'alto', reason: 'pagos o facturación', test: /(payment|billing|invoice|checkout|pricing|stripe|azul)/i },
  { level: 'alto', reason: 'autenticación', test: /(^|\/)(auth|mfa|session|middleware|csp)[^/]*\.[tj]sx?$|\/auth\/|auth-config|session-token/i },
  { level: 'alto', reason: 'autenticación', test: /(^|\/)[^/]*(auth|login|mfa|session|jwt|oauth)[^/]*\.(py|java|kt|cs|php|rb|go)$/i },
  { level: 'alto', reason: 'permisos y roles', test: /(authz|permission|rbac|roles?)\b|guard\.ts$/i },
  { level: 'alto', reason: 'permisos y roles', test: /(^|\/)[^/]*(authz|permission|rbac|role|policy|guard)[^/]*\.(py|java|kt|cs|php|rb|go)$/i },
  { level: 'alto', reason: 'datos personales', test: /(privacy|consent|terms)/i },
  { level: 'alto', reason: 'esquema de base de datos', test: /^packages\/db\/src\/schema\.ts$/ },
  { level: 'alto', reason: 'dependencias de producción o gestor', test: /^(pnpm-workspace\.yaml|\.gitleaks\.toml|scripts\/(src\/)?(risk|merge|gates|mode)[^/]*)$/ },
  { level: 'medio', reason: 'dependencias', test: /(^|\/)(package\.json|pnpm-lock\.yaml|tsconfig[^/]*\.json)$/ },
  { level: 'medio', reason: 'dependencias', test: /(^|\/)(requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|uv\.lock|Pipfile(\.lock)?|[^/]+\.(csproj|fsproj)|packages\.lock\.json|Directory\.Packages\.props|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|composer\.(json|lock)|Gemfile(\.lock)?|go\.(mod|sum))$/ },
  { level: 'bajo', reason: 'documentación', test: /^docs\/.+\.md$|^README\.md$/ },
  { level: 'bajo', reason: 'textos de interfaz', test: /^apps\/web\/src\/i18n\/messages\/[a-z]+\.ts$/ },
  { level: 'bajo', reason: 'estilos', test: /\.(css|scss)$/ },
];

export function classifyFile(file: string): { level: Level; reason: string } {
  const path = file.replace(/^\.\//, '');
  for (const r of RULES) if (r.test.test(path)) return { level: r.level, reason: r.reason };
  return { level: 'medio', reason: 'código sin regla específica' };
}

export function classifyRisk(files: string[], suggested?: Level): Classification {
  if (files.length === 0) return { level: 'alto', reasons: ['sin archivos: se trata como nivel superior'] };
  let level: Level = 'bajo';
  const reasons = new Set<string>();
  for (const file of files) {
    const c = classifyFile(file);
    level = maxLevel(level, c.level);
    if (c.level !== 'bajo') reasons.add(`${c.reason} (${file})`);
  }
  if (suggested && ORDER[suggested] > ORDER[level]) {
    level = suggested;
    reasons.add('nivel subido por un agente');
  }
  return { level, reasons: [...reasons] };
}
