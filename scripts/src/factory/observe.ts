// Post-release observation: production metrics become `factory` tickets, with duplicate control and a daily cap.
export interface Finding {
  fingerprint: string;
  title: string;
  body: string;
}

export const THRESHOLDS = { minEvents: 10, errorRate: 0.2, queueStuckSeconds: 600, deadJobs: 1 } as const;

function labelsOf(line: string): Record<string, string> {
  return Object.fromEntries([...line.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1]!, m[2]!]));
}

// Reads the Prometheus text served by /api/metrics (same format as apps/web/src/lib/metrics-text.ts).
export function findingsFromMetrics(text: string, t = THRESHOLDS): Finding[] {
  const flows = new Map<string, { success: number; failure: number }>();
  const out: Finding[] = [];
  let dead = 0;
  let oldest = 0;
  for (const line of text.split('\n')) {
    const value = Number(line.slice(line.lastIndexOf(' ') + 1));
    if (!Number.isFinite(value)) continue;
    if (line.startsWith('factory_flow_events{')) {
      const l = labelsOf(line);
      const f = flows.get(l.flow!) ?? { success: 0, failure: 0 };
      if (l.outcome === 'success') f.success = value;
      if (l.outcome === 'failure') f.failure = value;
      flows.set(l.flow!, f);
    } else if (line.startsWith('factory_queue_jobs{') && labelsOf(line).status === 'dead') dead = value;
    else if (line.startsWith('factory_queue_oldest_queued_seconds ')) oldest = value;
  }
  for (const [flow, f] of flows) {
    const total = f.success + f.failure;
    if (total >= t.minEvents && f.failure / total > t.errorRate) {
      const pct = Math.round((f.failure / total) * 100);
      out.push({
        fingerprint: `flow:${flow}:errors`,
        title: `Producción: el flujo "${flow}" falla ${pct}% de las veces`,
        body: `Métricas de producción: ${f.failure} fallos de ${total} eventos en la ventana reciente (umbral ${t.errorRate * 100}%). Investigar la causa, corregir y añadir una prueba que lo cubra.`,
      });
    }
  }
  if (dead >= t.deadJobs) {
    out.push({ fingerprint: 'queue:dead', title: `Producción: ${dead} trabajos fallidos agotaron sus intentos`, body: 'Revisar la cola de fallidos en el panel administrativo, corregir la causa y reencolar.' });
  }
  if (oldest > t.queueStuckSeconds) {
    out.push({ fingerprint: 'queue:stuck', title: 'Producción: la cola de trabajos está detenida', body: `El trabajo más antiguo espera hace ${Math.round(oldest / 60)} minutos. El trabajador puede estar caído.` });
  }
  return out;
}

const MARK = /<!--\s*factory-fingerprint:([^\s]+)\s*-->/;
export const fingerprintMarker = (fp: string): string => `<!-- factory-fingerprint:${fp} -->`;

export interface Selection {
  create: Finding[];
  duplicates: string[];
  capped: string[];
}

export function selectNewTickets(findings: Finding[], openTicketBodies: string[], createdToday: number, dailyCap: number): Selection {
  const open = new Set(openTicketBodies.map((b) => MARK.exec(b)?.[1]).filter((x): x is string => Boolean(x)));
  const result: Selection = { create: [], duplicates: [], capped: [] };
  let room = Math.max(0, dailyCap - createdToday);
  const seen = new Set<string>();
  for (const f of findings) {
    if (open.has(f.fingerprint) || seen.has(f.fingerprint)) {
      result.duplicates.push(f.fingerprint);
      continue;
    }
    seen.add(f.fingerprint);
    if (room === 0) result.capped.push(f.fingerprint);
    else {
      result.create.push(f);
      room -= 1;
    }
  }
  return result;
}
