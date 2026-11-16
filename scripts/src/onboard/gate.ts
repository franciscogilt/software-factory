// The safety-net gate: no ticket is accepted on an existing project until it passes.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateMap } from '../factory/outputs.ts';
import type { CheckResult } from './checks.ts';
import type { Profile } from './scan.ts';

export interface SafetyNet {
  flows: Record<string, string[]>; // critical flow -> characterization test files
}
export interface OnboardingState {
  status: 'pendiente' | 'completo';
  completedAt?: string;
  commit?: string;
  coverage?: number;
}
export const ONBOARDING_DIR = 'docs/onboarding';
export const CHARACTERIZATION = /(characterization|caracterizacion)/i;

export interface GateInput {
  profile: Profile;
  checks: CheckResult[];
  coverage: number | null;
  net: SafetyNet | null;
  mapText: string | null;
  exists: (relativePath: string) => boolean;
}

export function evaluateSafetyNet(i: GateInput): { ok: boolean; problems: string[] } {
  const problems: string[] = [];

  if (i.mapText === null) problems.push('falta el mapa del proyecto (docs/onboarding/map.md)');
  else for (const e of validateMap(i.mapText)) problems.push(`mapa: ${e}`);

  const failed = i.checks.filter((c) => c.status === 'fallo');
  for (const c of failed) problems.push(`el proyecto no pasa "${c.name}": arreglar eso es el primer trabajo`);
  const tests = i.checks.find((c) => c.name === 'pruebas');
  if (i.profile.testRunner === 'none' && i.profile.testFiles === 0) problems.push('sin red de seguridad: el proyecto no tiene pruebas');
  if (!tests || tests.status === 'ausente') problems.push('el proyecto no tiene un script "test" que se pueda ejecutar');

  const flows = i.net ? Object.entries(i.net.flows) : [];
  if (!i.net || flows.length === 0) problems.push('falta declarar flujos críticos con sus pruebas de caracterización (docs/onboarding/safety-net.json)');
  for (const [flow, files] of flows) {
    const valid = files.filter((f) => CHARACTERIZATION.test(f) && i.exists(f));
    if (valid.length === 0) problems.push(`el flujo crítico "${flow}" no tiene pruebas de caracterización existentes (nombre con "characterization")`);
  }
  if (i.coverage === null) problems.push('no se pudo medir la cobertura');
  return { ok: problems.length === 0, problems };
}

export function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function readConfigOrigin(root: string): 'new' | 'existing' {
  const p = join(root, 'product.config.yaml');
  if (!existsSync(p)) return 'new';
  return /^origin:\s*existing\b/m.test(readFileSync(p, 'utf8')) ? 'existing' : 'new';
}

// 'no-aplica' for new products; for existing ones only a completed onboarding opens the door.
export function onboardingStatus(root: string): 'no-aplica' | 'pendiente' | 'completo' {
  if (readConfigOrigin(root) !== 'existing') return 'no-aplica';
  return readJsonFile<OnboardingState>(join(root, ONBOARDING_DIR, 'state.json'))?.status === 'completo' ? 'completo' : 'pendiente';
}

// "Sin validación, no se construye": a new SaaS declares `validation: pending` until the owner approves the niche and the MVP.
export function discoveryStatus(root: string): 'no-aplica' | 'pendiente' | 'aprobada' {
  const p = join(root, 'product.config.yaml');
  if (!existsSync(p)) return 'no-aplica';
  const text = readFileSync(p, 'utf8');
  const v = /^validation:\s*(\w[\w-]*)/m.exec(text)?.[1];
  if (v === 'pending') return 'pendiente';
  if (v === 'approved') return 'aprobada';
  return 'no-aplica';
}
