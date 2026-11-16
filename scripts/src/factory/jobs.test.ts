import { describe, expect, it } from 'vitest';
import { completeStage, newJob, ownerApproved, STAGES, type Job, type Stage } from './jobs.ts';
import type { Limits } from './limits.ts';

const limits: Limits = { costPerTaskUsd: 5, minutesPerTask: 120, maxRetries: 3, maxConcurrentJobs: 2, autoTicketsPerDay: 5 };
const now = new Date('2026-11-15T12:00:00Z');
const fresh = (): Job => newJob({ tracker: 'github', id: '7', title: 't' }, limits, now);
const ok = (job: Job, stage: Stage, extra = {}) => completeStage(job, { stage, ok: true, ...extra }, limits, now);

describe('job state machine', () => {
  it('runs the stages in order and finishes', () => {
    let job = fresh();
    for (const stage of STAGES) {
      if (job.status === 'esperando-dueno') job = ownerApproved(job, now);
      job = ok(job, stage, { level: stage === 'especificacion' ? 'bajo' : undefined });
    }
    expect(job.status).toBe('terminado');
  });

  it('rejects an out-of-order stage', () => {
    expect(() => ok(fresh(), 'puertas')).toThrow(/fuera de orden/);
  });

  it('repeating a completed stage changes nothing (no duplicated cost or history)', () => {
    const once = ok(fresh(), 'entrada', { costUsd: 1 });
    const twice = completeStage(once, { stage: 'entrada', ok: true, costUsd: 1 }, limits, now);
    expect(twice).toEqual(once);
    expect(twice.costUsd).toBe(1);
  });

  it('escalates after 3 failures of the same stage and then refuses more', () => {
    let job = fresh();
    for (let i = 0; i < 3; i++) job = completeStage(job, { stage: 'entrada', ok: false }, limits, now);
    expect(job.status).toBe('escalado');
    expect(job.escalation).toContain('3 veces');
    expect(() => ok(job, 'entrada')).toThrow(/escalado/);
  });

  it('escalates when cost or minutes exceed the budget', () => {
    expect(ok(fresh(), 'entrada', { costUsd: 5.01 }).escalation).toContain('costo');
    expect(ok(fresh(), 'entrada', { minutes: 121 }).escalation).toContain('tiempo');
    expect(ok(fresh(), 'entrada', { costUsd: 5 }).status).toBe('activo');
  });

  it('waits for the owner before approval on medium, high or unknown level, never on low', () => {
    const upTo = (level: 'bajo' | 'medio' | 'alto' | undefined) => {
      let job = ok(fresh(), 'entrada');
      job = ok(job, 'especificacion', { level });
      for (const s of ['construccion', 'puertas', 'revision'] as const) job = ok(job, s);
      return job;
    };
    expect(upTo('medio').status).toBe('esperando-dueno');
    expect(upTo('alto').status).toBe('esperando-dueno');
    expect(upTo(undefined).status).toBe('esperando-dueno');
    expect(upTo('bajo').status).toBe('activo');
  });

  it('a waiting job cannot advance until the owner approves', () => {
    let job = ok(fresh(), 'entrada');
    job = ok(job, 'especificacion', { level: 'alto' });
    for (const s of ['construccion', 'puertas', 'revision'] as const) job = ok(job, s);
    expect(() => ok(job, 'aprobacion')).toThrow(/esperando-dueno/);
    expect(ok(ownerApproved(job, now), 'aprobacion').stage).toBe('observacion');
  });

  it('lets an agent raise the level but not lower it', () => {
    const job = ok(fresh(), 'entrada', { level: 'alto' });
    expect(job.level).toBe('alto');
    expect(() => ok(job, 'especificacion', { level: 'bajo' })).toThrow(/bajar/);
  });

  it('rejects negative cost', () => {
    expect(() => ok(fresh(), 'entrada', { costUsd: -1 })).toThrow(/negativos/);
  });
});
