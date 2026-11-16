// Each agent writes exactly one file. These validators are scripts, so the format check never depends on an AI.
export type Role = 'analista' | 'revisor' | 'auditor-seguridad' | 'gerente' | 'arquitecto';

export function expectedOutput(role: Role, jobId: string): string {
  switch (role) {
    case 'analista':
      return `docs/specs/${jobId}/spec.md`;
    case 'revisor':
      return `.factory-state/jobs/${jobId}/review.md`;
    case 'auditor-seguridad':
      return `.factory-state/jobs/${jobId}/security-review.md`;
    case 'gerente':
      return `.factory-state/jobs/${jobId}/decision.json`;
    case 'arquitecto':
      return 'docs/onboarding/map.md';
  }
}

export function checkSingleOutput(role: Role, jobId: string, touched: string[]): string[] {
  const expected = expectedOutput(role, jobId);
  const errors: string[] = [];
  if (!touched.includes(expected)) errors.push(`falta la salida ${expected}`);
  for (const f of touched) if (f !== expected) errors.push(`archivo fuera de la salida del agente: ${f}`);
  return errors;
}

export function validateSpec(text: string): string[] {
  const errors: string[] = [];
  if (!/^- Nivel de riesgo:\s*(bajo|medio|alto)\b/m.test(text)) errors.push('falta "Nivel de riesgo: bajo|medio|alto"');
  if (!/^- Modo:\s*(ligero|completo)\b/m.test(text)) errors.push('falta "Modo: ligero|completo"');
  const criteria = /## Criterios de aceptación\n([\s\S]*?)(\n## |$)/.exec(text)?.[1] ?? '';
  const given = criteria.split('\n').filter((l) => /^- Dado .+, cuando .+, entonces .+/i.test(l.trim()));
  if (given.length === 0) errors.push('no hay criterios "Dado …, cuando …, entonces …"');
  if (/<[^>\n]+>/.test(criteria)) errors.push('los criterios aún tienen marcadores de la plantilla');
  if (!/## Alcance/.test(text)) errors.push('falta la sección Alcance');
  return errors;
}

export function validateReview(text: string): string[] {
  const errors: string[] = [];
  if (!/^Veredicto:\s*(aprobado|cambios)\s*$/m.test(text)) errors.push('falta "Veredicto: aprobado|cambios"');
  for (const section of ['Alcance', 'Calidad', 'Pruebas', 'Seguridad']) {
    if (!new RegExp(`^## ${section}`, 'm').test(text)) errors.push(`falta la sección ${section}`);
  }
  if (/^Veredicto:\s*aprobado/m.test(text) && !/^## Riesgos que quedan/m.test(text)) errors.push('un veredicto aprobado debe listar "Riesgos que quedan"');
  return errors;
}

export function validateSecurityReview(text: string): string[] {
  const errors: string[] = [];
  if (!/^Hallazgos críticos:\s*\d+\s*$/m.test(text)) errors.push('falta "Hallazgos críticos: N"');
  if (!/^## (Crítica|Alta|Media|Baja)/m.test(text) && !/^Sin hallazgos\b/m.test(text)) errors.push('sin hallazgos por severidad ni "Sin hallazgos"');
  return errors;
}

const MAP_SECTIONS = ['Cómo correrlo', 'Arquitectura', 'Módulos', 'Convenciones', 'Dependencias', 'Deudas', 'Flujos críticos'];
export function validateMap(text: string): string[] {
  const errors: string[] = [];
  for (const section of MAP_SECTIONS) {
    const body = new RegExp(`^## ${section}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'm').exec(text)?.[1]?.trim() ?? null;
    if (body === null) errors.push(`falta la sección ${section}`);
    else if (body.length < 20) errors.push(`la sección ${section} está vacía`);
  }
  if (/\{\{[^}]*\}\}/.test(text)) errors.push('quedan marcadores de plantilla {{…}} sin llenar');
  return errors;
}

const ACTIONS = ['iniciar', 'preguntar-al-autor', 'rechazar', 'escalar'];
export function validateDecision(text: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return ['decision.json no es JSON válido'];
  }
  const d = data as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof d.job !== 'string') errors.push('falta "job"');
  if (typeof d.action !== 'string' || !ACTIONS.includes(d.action)) errors.push(`"action" debe ser ${ACTIONS.join('|')}`);
  if (d.level !== undefined && !['bajo', 'medio', 'alto'].includes(String(d.level))) errors.push('"level" inválido');
  if (!Array.isArray(d.reasons) || d.reasons.length === 0) errors.push('"reasons" debe tener al menos un motivo');
  return errors;
}

export const VALIDATORS: Record<Role, (text: string) => string[]> = {
  analista: validateSpec,
  revisor: validateReview,
  'auditor-seguridad': validateSecurityReview,
  gerente: validateDecision,
  arquitecto: validateMap,
};
