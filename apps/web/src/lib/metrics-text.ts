import type { FlowStat } from '@factory/jobs';

type QueueStats = { queued: number; running: number; dead: number; oldestQueuedMs: number | null };

// Prometheus text format: queue gauges and per-flow counters over the recent window.
export function renderMetrics(queue: QueueStats, flows: FlowStat[], windowSeconds: number): string {
  const lines = [
    '# TYPE factory_queue_jobs gauge',
    `factory_queue_jobs{status="queued"} ${queue.queued}`,
    `factory_queue_jobs{status="running"} ${queue.running}`,
    `factory_queue_jobs{status="dead"} ${queue.dead}`,
    '# TYPE factory_queue_oldest_queued_seconds gauge',
    `factory_queue_oldest_queued_seconds ${queue.oldestQueuedMs === null ? 0 : Math.round(queue.oldestQueuedMs / 1000)}`,
    '# TYPE factory_flow_events gauge',
  ];
  const escape = (v: string) => v.replace(/[\\"\n]/g, '_');
  for (const f of flows) {
    for (const outcome of ['success', 'failure', 'limited'] as const) {
      lines.push(`factory_flow_events{flow="${escape(f.flow)}",outcome="${outcome}",window="${windowSeconds}s"} ${f[outcome]}`);
    }
  }
  lines.push('# TYPE factory_flow_p95_ms gauge');
  for (const f of flows) lines.push(`factory_flow_p95_ms{flow="${escape(f.flow)}"} ${Math.round(f.p95Ms)}`);
  return lines.join('\n') + '\n';
}
