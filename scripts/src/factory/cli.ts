// Orchestrator CLI. Run from a session: the session executes the agents; this script keeps state and enforces the rules.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defaultRepo } from '../repo.ts';
import { githubTracker, observationApi } from './github.ts';
import { findingsFromMetrics, fingerprintMarker, selectNewTickets } from './observe.ts';
import { runIntake, wrapUntrusted } from './intake.ts';
import { completeStage, ownerApproved, STAGES, type Job, type Level, type Stage } from './jobs.ts';
import { loadLimits } from './limits.ts';
import { runEval, type EvalCase } from './evals.ts';
import { checkSingleOutput, expectedOutput, VALIDATORS, type Role } from './outputs.ts';
import { discoveryStatus, onboardingStatus } from '../onboard/gate.ts';
import { isStopped, jobPath, listJobFiles, readJson, writeJsonAtomic } from './store.ts';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());

const [cmd, ...rest] = process.argv.slice(2);
const STATE = process.env.FACTORY_STATE_DIR ?? '.factory-state';
const REPO = defaultRepo();

function arg(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}
function need(name: string): string {
  const v = arg(name);
  if (!v) {
    console.error(`Falta --${name}`);
    process.exit(2);
  }
  return v;
}
function loadJobs(): Job[] {
  return listJobFiles(STATE).map((f) => readJson<Job>(f)!).filter(Boolean);
}
function loadJob(id: string): Job {
  const job = readJson<Job>(jobPath(STATE, id));
  if (!job) {
    console.error(`No existe el trabajo ${id}`);
    process.exit(2);
  }
  return job;
}
function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function main() {
  const limits = loadLimits();
  const now = new Date();

  if (cmd === 'intake') {
    const tracker = githubTracker(REPO);
    const r = await runIntake({ tracker, existing: loadJobs(), limits, now, stopped: isStopped(STATE), onboarding: onboardingStatus(process.env.FACTORY_PRODUCT_DIR ?? process.cwd()), discovery: discoveryStatus(process.env.FACTORY_PRODUCT_DIR ?? process.cwd()) });
    for (const job of r.started) {
      writeJsonAtomic(jobPath(STATE, job.id), job);
      await tracker.comment(job.ticket.id, `La fábrica tomó este ticket como trabajo \`${job.id}\`. Etapa inicial: entrada.`);
    }
    console.log(JSON.stringify({ iniciados: r.started.map((j) => j.id), en_cola: r.queued, rechazados: r.rejected }, null, 2));
  } else if (cmd === 'status') {
    const jobs = loadJobs();
    if (jobs.length === 0) console.log('Sin trabajos.');
    for (const j of jobs) {
      console.log(`${j.id}  ${j.status}  etapa=${j.stage}  nivel=${j.level ?? '?'}  costo=${j.costUsd}/${j.budget.costUsd} USD  min=${j.minutes}/${j.budget.minutes}${j.escalation ? `  ESCALADO: ${j.escalation}` : ''}`);
    }
  } else if (cmd === 'ticket') {
    // Prints the ticket wrapped as untrusted data, ready to hand to the analyst.
    const id = need('id');
    const tickets = await githubTracker(REPO).listLabeled('factory');
    const t = tickets.find((x) => x.id === id);
    if (!t) fail(`El ticket ${id} no tiene la etiqueta factory o está cerrado`);
    console.log(wrapUntrusted(t));
  } else if (cmd === 'stage') {
    if (isStopped(STATE)) fail('Interruptor de emergencia activo: no se avanza nada');
    const job = loadJob(need('job'));
    const stage = need('stage') as Stage;
    if (!STAGES.includes(stage)) fail(`Etapa desconocida: ${stage}`);
    const level = arg('level') as Level | undefined;
    const next = completeStage(
      job,
      { stage, ok: !rest.includes('--fail'), costUsd: Number(arg('cost') ?? 0), minutes: Number(arg('minutes') ?? 0), note: arg('note'), level },
      limits,
      now,
    );
    writeJsonAtomic(jobPath(STATE, job.id), next);
    console.log(`${next.id}: ${next.status}, siguiente etapa ${next.stage}${next.escalation ? `, ESCALADO: ${next.escalation}` : ''}`);
    if (next.status === 'escalado') process.exit(3);
  } else if (cmd === 'approve') {
    // Records that the owner approved (merged the PR). Only the owner's session runs this.
    const next = ownerApproved(loadJob(need('job')), now);
    writeJsonAtomic(jobPath(STATE, next.id), next);
    console.log(`${next.id}: reanudado tras la aprobación del dueño`);
  } else if (cmd === 'check-output') {
    // Validates what an agent wrote: exactly its one file, in the right format.
    const role = need('role') as Role;
    const job = need('job');
    const validate = VALIDATORS[role];
    if (!validate) fail(`Rol sin salida validable: ${role}`);
    const touched = (arg('touched') ?? expectedOutput(role, job)).split(',').filter(Boolean);
    const errors = checkSingleOutput(role, job, touched);
    if (errors.length === 0) errors.push(...validate(readFileSync(expectedOutput(role, job), 'utf8')));
    if (errors.length) fail(errors.map((e) => `✘ ${e}`).join('\n'));
    console.log(`Salida de ${role} válida: ${expectedOutput(role, job)}`);
  } else if (cmd === 'observe') {
    // Turns production metrics into `factory` tickets: no duplicates, and at most autoTicketsPerDay per day.
    if (isStopped(STATE)) fail('Interruptor de emergencia activo: no se crean tickets');
    const url = need('metrics-url');
    const token = process.env.METRICS_TOKEN;
    if (!token) fail('Falta METRICS_TOKEN');
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) fail(`Las métricas respondieron ${response.status}`);
    const findings = findingsFromMetrics(await response.text());
    const api = observationApi(REPO);
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const pick = selectNewTickets(findings, api.listOpen().map((t) => t.body), api.createdSince(startOfDay), limits.autoTicketsPerDay);
    const created = rest.includes('--dry-run') ? [] : pick.create.map((f) => api.create(f.title, `${f.body}\n\n${fingerprintMarker(f.fingerprint)}`));
    console.log(JSON.stringify({ hallazgos: findings.length, creados: created, duplicados: pick.duplicates, por_tope: pick.capped, simulacion: rest.includes('--dry-run') }, null, 2));
  } else if (cmd === 'eval') {
    // Scores an agent's output against an evaluation case: factory eval --case evals/analista/x.json --file <output>
    const c = JSON.parse(readFileSync(need('case'), 'utf8')) as EvalCase;
    const errors = runEval(c, readFileSync(need('file'), 'utf8'));
    if (errors.length) fail(errors.map((e) => `✘ ${e}`).join('\n'));
    console.log('Evaluación superada');
  } else {
    console.error('Uso: factory intake|status|ticket|stage|approve|check-output|eval|observe');
    process.exit(2);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
