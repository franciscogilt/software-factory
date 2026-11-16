// Evaluation cases per role: input ticket, expected checks, and golden good/bad outputs.
// The runner is deterministic: it checks format (validators) and content (regexes), never asks an AI.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { VALIDATORS, type Role } from './outputs.ts';

export interface EvalCase {
  role: Role;
  description: string;
  ticket: string;
  output: string;
  mustMatch: string[];
  mustNotMatch: string[];
  good: string;
  bad: string;
}

function toRegExp(source: string): RegExp {
  return source.startsWith('(?i)') ? new RegExp(source.slice(4), 'i') : new RegExp(source);
}

export function runEval(c: EvalCase, output: string): string[] {
  const errors = [...VALIDATORS[c.role](output)];
  for (const m of c.mustMatch) if (!toRegExp(m).test(output)) errors.push(`debe contener /${m}/`);
  for (const m of c.mustNotMatch) if (toRegExp(m).test(output)) errors.push(`no debe contener /${m}/`);
  return errors;
}

export function loadEvalCases(dir = 'evals'): { file: string; case: EvalCase }[] {
  if (!existsSync(dir)) return [];
  const out: { file: string; case: EvalCase }[] = [];
  for (const role of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const f of readdirSync(join(dir, role.name)).filter((x) => x.endsWith('.json'))) {
      const file = join(dir, role.name, f);
      out.push({ file, case: JSON.parse(readFileSync(file, 'utf8')) as EvalCase });
    }
  }
  return out;
}
