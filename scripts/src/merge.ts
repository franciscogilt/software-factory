// Pure merge decision: the script refuses to merge without the approval the risk level requires.
import type { Level } from './risk.ts';

export interface Review {
  user: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  commitId: string;
}

export interface Check {
  name: string;
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
}

export interface MergeInput {
  level: Level;
  author: string;
  headSha: string;
  draft: boolean;
  mergeable: boolean | null;
  checks: Check[];
  requiredChecks: string[];
  reviews: Review[];
  owner: string;
  reviewers: string[];
}

export interface MergeDecision {
  allow: boolean;
  reasons: string[];
}

function latestByUser(reviews: Review[]): Map<string, Review> {
  const latest = new Map<string, Review>();
  for (const r of reviews) {
    if (r.state === 'COMMENTED' || r.state === 'PENDING') continue;
    latest.set(r.user, r); // reviews arrive in chronological order
  }
  return latest;
}

export function decideMerge(input: MergeInput): MergeDecision {
  const reasons: string[] = [];

  if (input.draft) reasons.push('el PR está en borrador');
  if (input.mergeable !== true) reasons.push('el PR tiene conflictos o aún no se sabe si es fusionable');

  for (const name of input.requiredChecks) {
    const c = input.checks.find((x) => x.name === name);
    if (!c || c.conclusion === null) reasons.push(`la puerta "${name}" está pendiente`);
    else if (c.conclusion !== 'success') reasons.push(`la puerta "${name}" no pasó (${c.conclusion})`);
  }

  const latest = latestByUser(input.reviews);
  const valid = (r: Review) => r.state === 'APPROVED' && r.commitId === input.headSha;
  const blocked = [...latest.values()].filter((r) => r.state === 'CHANGES_REQUESTED');
  if (blocked.length > 0) reasons.push(`hay cambios solicitados por ${blocked.map((r) => r.user).join(', ')}`);

  if (input.level === 'medio') {
    const allowed = new Set([input.owner, ...input.reviewers]);
    const ok = [...latest.values()].some((r) => valid(r) && r.user !== input.author && allowed.has(r.user));
    if (!ok) reasons.push('nivel medio: falta la aprobación de un revisor distinto del autor sobre el último commit');
  }
  if (input.level === 'alto') {
    const ok = [...latest.values()].some((r) => valid(r) && r.user === input.owner);
    if (!ok) reasons.push('nivel alto: falta la aprobación del dueño sobre el último commit');
  }

  return { allow: reasons.length === 0, reasons };
}
