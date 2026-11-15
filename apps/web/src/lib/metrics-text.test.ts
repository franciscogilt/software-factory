import { describe, expect, it } from 'vitest';
import { renderMetrics } from './metrics-text';

describe('renderMetrics', () => {
  it('renders queue and flow gauges in Prometheus text format', () => {
    const text = renderMetrics({ queued: 2, running: 1, dead: 3, oldestQueuedMs: 12_000 }, [{ flow: 'login', success: 4, failure: 1, limited: 2, p95Ms: 41.6 }], 900);
    expect(text).toContain('factory_queue_jobs{status="dead"} 3');
    expect(text).toContain('factory_queue_oldest_queued_seconds 12');
    expect(text).toContain('factory_flow_events{flow="login",outcome="failure",window="900s"} 1');
    expect(text).toContain('factory_flow_p95_ms{flow="login"} 42');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('reports zero age when nothing is queued and sanitizes label values', () => {
    const text = renderMetrics({ queued: 0, running: 0, dead: 0, oldestQueuedMs: null }, [{ flow: 'a"b', success: 0, failure: 0, limited: 0, p95Ms: 0 }], 900);
    expect(text).toContain('factory_queue_oldest_queued_seconds 0');
    expect(text).toContain('flow="a_b"');
  });
});
