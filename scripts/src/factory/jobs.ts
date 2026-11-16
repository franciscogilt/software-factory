// Job state machine. Pure functions over a Job object; persistence lives in store.ts.
import type { Limits } from './limits.ts';

export const STAGES = ['entrada', 'especificacion', 'construccion', 'puertas', 'revision', 'aprobacion', 'observacion'] as const;
export type Stage = (typeof STAGES)[number];
export type JobStatus = 'activo' | 'esperando-dueno' | 'escalado' | 'terminado';
export type Level = 'bajo' | 'medio' | 'alto';

export interface HistoryEntry {
  stage: Stage;
  at: string;
  ok: boolean;
  costUsd: number;
  minutes: number;
  note: string;
}

export interface Job {
  id: string;
  ticket: { tracker: string; id: string; title: string };
  level: Level | null;
  stage: Stage; // the stage to work next
  status: JobStatus;
  escalation: string | null;
  attempts: Partial<Record<Stage, number>>;
  costUsd: number;
  minutes: number;
  budget: { costUsd: number; minutes: number };
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export function newJob(ticket: Job['ticket'], limits: Limits, now: Date): Job {
  const id = `${ticket.tracker}-${ticket.id}`;
  return {
    id,
    ticket,
    level: null,
    stage: 'entrada',
    status: 'activo',
    escalation: null,
    attempts: {},
    costUsd: 0,
    minutes: 0,
    budget: { costUsd: limits.costPerTaskUsd, minutes: limits.minutesPerTask },
    history: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export interface StageReport {
  stage: Stage;
  ok: boolean;
  costUsd?: number;
  minutes?: number;
  note?: string;
  level?: Level; // an agent may raise the level, never lower it
}

const LEVEL_ORDER: Record<Level, number> = { bajo: 0, medio: 1, alto: 2 };

function escalate(job: Job, reason: string): Job {
  return { ...job, status: 'escalado', escalation: reason };
}

// Returns a new Job. Throws on rule violations (out of order, job not active, retries exhausted).
export function completeStage(job: Job, report: StageReport, limits: Limits, now: Date): Job {
  if (job.status !== 'activo') throw new Error(`El trabajo ${job.id} está ${job.status}; no avanza`);
  const done = job.history.some((h) => h.stage === report.stage && h.ok);
  if (done) return job; // repeating a completed stage has no effects
  if (report.stage !== job.stage) throw new Error(`Etapa fuera de orden: toca ${job.stage}, llegó ${report.stage}`);
  const cost = report.costUsd ?? 0;
  const minutes = report.minutes ?? 0;
  if (cost < 0 || minutes < 0) throw new Error('Costo y minutos no pueden ser negativos');

  let next: Job = {
    ...job,
    costUsd: round(job.costUsd + cost),
    minutes: round(job.minutes + minutes),
    history: [...job.history, { stage: report.stage, at: now.toISOString(), ok: report.ok, costUsd: cost, minutes, note: report.note ?? '' }],
    updatedAt: now.toISOString(),
  };

  if (report.level) {
    const current = next.level;
    if (current && LEVEL_ORDER[report.level] < LEVEL_ORDER[current]) {
      throw new Error(`Un agente no puede bajar el nivel de ${current} a ${report.level}`);
    }
    next = { ...next, level: report.level };
  }

  if (report.ok) {
    const index = STAGES.indexOf(report.stage);
    const following = STAGES[index + 1];
    if (!following) next = { ...next, status: 'terminado' };
    else next = { ...next, stage: following };
    // A medium or high change never goes past approval on its own.
    if (following === 'aprobacion' && next.level !== 'bajo') next = { ...next, status: 'esperando-dueno' };
  } else {
    const attempts = (next.attempts[report.stage] ?? 0) + 1;
    next = { ...next, attempts: { ...next.attempts, [report.stage]: attempts } };
    if (attempts >= limits.maxRetries) next = escalate(next, `la etapa ${report.stage} falló ${attempts} veces`);
  }

  if (next.status === 'activo' || next.status === 'esperando-dueno') {
    if (next.costUsd > next.budget.costUsd) next = escalate(next, `presupuesto de costo superado (${next.costUsd} > ${next.budget.costUsd} USD)`);
    else if (next.minutes > next.budget.minutes) next = escalate(next, `presupuesto de tiempo superado (${next.minutes} > ${next.budget.minutes} min)`);
  }
  return next;
}

// The owner's approval (merging the PR) resumes a job that was waiting for it.
export function ownerApproved(job: Job, now: Date): Job {
  if (job.status !== 'esperando-dueno') throw new Error(`El trabajo ${job.id} no espera aprobación`);
  return { ...job, status: 'activo', updatedAt: now.toISOString() };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
