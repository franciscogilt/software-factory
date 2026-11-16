import { describe, expect, it } from 'vitest';
import { findingsFromMetrics, fingerprintMarker, selectNewTickets } from './observe.ts';
import { renderMetrics } from '../../../apps/web/src/lib/metrics-text.ts';

const flow = (flow: string, success: number, failure: number) => ({ flow, success, failure, limited: 0, p95Ms: 10 });
const queue = { queued: 0, running: 0, dead: 0, oldestQueuedMs: null };

describe('findingsFromMetrics (reads the real metrics format)', () => {
  it('flags a flow with too many failures', () => {
    const f = findingsFromMetrics(renderMetrics(queue, [flow('login', 6, 4)], 900));
    expect(f.map((x) => x.fingerprint)).toEqual(['flow:login:errors']);
    expect(f[0]!.title).toContain('40%');
  });
  it('ignores low traffic and healthy flows', () => {
    expect(findingsFromMetrics(renderMetrics(queue, [flow('login', 1, 5), flow('export', 100, 5)], 900))).toEqual([]);
  });
  it('flags dead jobs and a stuck queue', () => {
    const f = findingsFromMetrics(renderMetrics({ queued: 2, running: 0, dead: 3, oldestQueuedMs: 20 * 60_000 }, [], 900));
    expect(f.map((x) => x.fingerprint).sort()).toEqual(['queue:dead', 'queue:stuck']);
  });
});

describe('selectNewTickets', () => {
  const findings = [
    { fingerprint: 'a', title: 'A', body: '' },
    { fingerprint: 'b', title: 'B', body: '' },
    { fingerprint: 'c', title: 'C', body: '' },
  ];
  it('skips problems that already have an open ticket', () => {
    const r = selectNewTickets(findings, [`texto\n${fingerprintMarker('a')}`], 0, 5);
    expect(r.create.map((f) => f.fingerprint)).toEqual(['b', 'c']);
    expect(r.duplicates).toEqual(['a']);
  });
  it('respects the daily cap, counting tickets already created today', () => {
    const r = selectNewTickets(findings, [], 4, 5);
    expect(r.create).toHaveLength(1);
    expect(r.capped).toHaveLength(2);
    expect(selectNewTickets(findings, [], 5, 5).create).toHaveLength(0);
  });
  it('does not create the same finding twice in one run', () => {
    const r = selectNewTickets([findings[0]!, findings[0]!], [], 0, 5);
    expect(r.create).toHaveLength(1);
  });
});
