import { describe, expect, it } from 'vitest';
import { checkSingleOutput, expectedOutput, validateDecision, validateReview, validateSecurityReview, validateSpec } from './outputs.ts';

const goodSpec = `# Especificación: x

- Ticket: #1
- Producto: p
- Nivel de riesgo: medio
- Modo: completo

## Alcance

Incluye: a

## Criterios de aceptación

- Dado un usuario, cuando exporta, entonces recibe un CSV.

## Preguntas abiertas

- Ninguna
`;

describe('single output', () => {
  it('accepts exactly the agent file and rejects extras or a missing file', () => {
    const f = expectedOutput('analista', 'github-1');
    expect(checkSingleOutput('analista', 'github-1', [f])).toEqual([]);
    expect(checkSingleOutput('analista', 'github-1', [f, 'apps/web/src/x.ts'])).toHaveLength(1);
    expect(checkSingleOutput('analista', 'github-1', ['otra/ruta.md'])).toHaveLength(2);
  });
});

describe('validateSpec', () => {
  it('accepts a complete spec', () => expect(validateSpec(goodSpec)).toEqual([]));
  it('rejects missing risk, mode, criteria or leftover template markers', () => {
    expect(validateSpec(goodSpec.replace('- Nivel de riesgo: medio', ''))).toHaveLength(1);
    expect(validateSpec(goodSpec.replace('- Modo: completo', ''))).toHaveLength(1);
    expect(validateSpec(goodSpec.replace(/- Dado.*/, '- Debe funcionar bien.'))).not.toEqual([]);
    expect(validateSpec(goodSpec.replace('- Dado un usuario', '- Dado <contexto>'))).not.toEqual([]);
  });
});

describe('validateReview', () => {
  const good = '# Revisión\n\nVeredicto: cambios\n\n## Alcance\n.\n## Calidad\n.\n## Pruebas\n.\n## Seguridad\n.\n';
  it('needs a verdict and the four sections', () => {
    expect(validateReview(good)).toEqual([]);
    expect(validateReview(good.replace('Veredicto: cambios', 'Se ve bien')).length).toBeGreaterThan(0);
    expect(validateReview(good.replace('## Seguridad\n.\n', ''))).toHaveLength(1);
  });
  it('an approving review must list the risks that remain', () => {
    const approved = good.replace('cambios', 'aprobado');
    expect(validateReview(approved)).toHaveLength(1);
    expect(validateReview(`${approved}\n## Riesgos que quedan\nNinguno conocido\n`)).toEqual([]);
  });
});

describe('validateSecurityReview', () => {
  it('needs the critical count and severity sections or an explicit "Sin hallazgos"', () => {
    expect(validateSecurityReview('Hallazgos críticos: 0\n\nSin hallazgos\n')).toEqual([]);
    expect(validateSecurityReview('Hallazgos críticos: 1\n\n## Crítica\n- x\n')).toEqual([]);
    expect(validateSecurityReview('todo bien')).toHaveLength(2);
  });
});

describe('validateDecision', () => {
  it('validates the schema', () => {
    expect(validateDecision('{"job":"github-1","action":"iniciar","level":"medio","reasons":["ok"]}')).toEqual([]);
    expect(validateDecision('no json')).toHaveLength(1);
    expect(validateDecision('{"job":"g","action":"borrar-todo","reasons":[]}').length).toBe(2);
  });
});
