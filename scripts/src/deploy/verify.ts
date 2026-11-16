// Post-deploy watch: probe health for a while and decide, by rule, whether to roll back.
export interface Probe {
  ok: boolean;
  failed: string[];
}

export interface WatchResult {
  rollback: boolean;
  reason?: string;
  probes: number;
}

export function decideRollback(probes: Probe[], maxConsecutiveFailures = 3): { rollback: boolean; reason?: string } {
  let streak = 0;
  for (const p of probes) {
    streak = p.ok ? 0 : streak + 1;
    if (streak >= maxConsecutiveFailures) {
      const last = probes.filter((x) => !x.ok).at(-1)!;
      return { rollback: true, reason: `${streak} comprobaciones seguidas fallaron: ${last.failed.join('; ') || 'sin detalle'}` };
    }
  }
  return { rollback: false };
}

export async function watch(opts: {
  probe: () => Promise<string[]>;
  durationMs: number;
  intervalMs: number;
  maxConsecutiveFailures?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<WatchResult> {
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const rounds = Math.max(1, Math.ceil(opts.durationMs / opts.intervalMs));
  const probes: Probe[] = [];
  for (let i = 0; i < rounds; i++) {
    let failed: string[];
    try {
      failed = await opts.probe();
    } catch (e) {
      failed = [`la comprobación falló: ${e instanceof Error ? e.message : String(e)}`];
    }
    probes.push({ ok: failed.length === 0, failed });
    const decision = decideRollback(probes, opts.maxConsecutiveFailures);
    if (decision.rollback) return { ...decision, probes: probes.length };
    if (i < rounds - 1) await sleep(opts.intervalMs);
  }
  return { rollback: false, probes: probes.length };
}
