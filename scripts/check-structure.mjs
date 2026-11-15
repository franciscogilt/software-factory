// Valida que el repositorio tenga la estructura mínima de la fábrica.
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const required = [
  'CLAUDE.md', 'AGENTS.md', 'README.md', 'pnpm-workspace.yaml',
  'product.config.example.yaml', 'docs/limits.md',
  'docs/templates/spec.md', 'docs/templates/adr.md', 'docs/templates/postmortem.md',
];
const agents = ['gerente', 'disenador', 'mejora', 'analista', 'arquitecto',
  'desarrollador', 'revisor', 'tester', 'auditor-seguridad', 'devops'];
const errors = [];

for (const f of required) if (!existsSync(f)) errors.push(`Falta ${f}`);
for (const a of agents) if (!existsSync(`.claude/agents/${a}.md`)) errors.push(`Falta agente ${a}`);

if (existsSync('CLAUDE.md')) {
  const claude = readFileSync('CLAUDE.md', 'utf8');
  const lines = claude.split('\n').length;
  if (lines > 120) errors.push(`CLAUDE.md tiene ${lines} líneas; debe ser corto (máx. 120)`);
  const links = [...claude.matchAll(/`(docs\/rules\/[\w.-]+\.md)`/g)].map((m) => m[1]);
  for (const l of new Set(links)) if (!existsSync(l)) errors.push(`CLAUDE.md enlaza ${l}, que no existe`);
}
if (existsSync('docs/rules')) {
  if (readdirSync('docs/rules').length === 0) errors.push('docs/rules está vacío');
}

if (errors.length) {
  console.error(errors.map((e) => `- ${e}`).join('\n'));
  process.exit(1);
}
console.log('Estructura del repositorio correcta.');
