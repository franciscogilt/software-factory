import { describe, expect, it } from 'vitest';
import { runRelease, type Deployer, type Env, type ReleaseSteps } from './release.ts';
import { smokeCheck, waitUntilReady, type Fetcher, type Res } from './smoke.ts';
import { decideRollback, watch } from './verify.ts';

const goodHeaders: Record<string, string> = {
  'content-security-policy': "default-src 'self'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
};
const res = (status: number, body = '', headers: Record<string, string> = {}): Res => ({
  status,
  headers: { get: (n) => headers[n.toLowerCase()] ?? null },
  text: async () => body,
});

function healthy(overrides: Record<string, Res | Error> = {}): Fetcher {
  const routes: Record<string, Res | Error> = {
    '/api/health/live': res(200),
    '/api/health/ready': res(200, '{"ready":true}'),
    '/': res(200, '', goodHeaders),
    '/login': res(200),
    '/api/metrics': res(401),
    ...overrides,
  };
  return async (url) => {
    const r = routes[new URL(url).pathname];
    if (!r) return res(404);
    if (r instanceof Error) throw r;
    return r;
  };
}

describe('smokeCheck', () => {
  it('passes on a healthy environment', async () => {
    expect(await smokeCheck('http://x', healthy())).toEqual([]);
  });
  it('names a missing security header', async () => {
    const { 'x-frame-options': _omit, ...rest } = goodHeaders;
    const failed = await smokeCheck('http://x', healthy({ '/': res(200, '', rest) }));
    expect(failed).toEqual(['falta la cabecera de seguridad x-frame-options']);
  });
  it('fails when ready is false, a route errors, or the host is down', async () => {
    expect((await smokeCheck('http://x', healthy({ '/api/health/ready': res(200, '{"ready":false}') }))).join()).toContain('ready=true');
    expect((await smokeCheck('http://x', healthy({ '/api/health/ready': res(503) }))).join()).toContain('503');
    expect((await smokeCheck('http://x', healthy({ '/login': res(500) }))).join()).toContain('/login');
    expect((await smokeCheck('http://x', healthy({ '/api/health/live': new Error('ECONNREFUSED') }))).join()).toContain('sin respuesta');
  });
  it('requires metrics to be closed without a token', async () => {
    expect((await smokeCheck('http://x', healthy({ '/api/metrics': res(200) }))).join()).toContain('401');
  });
  it('requires HSTS only over https', async () => {
    expect(await smokeCheck('http://x', healthy())).toEqual([]);
    expect((await smokeCheck('https://x', healthy())).join()).toContain('strict-transport-security');
  });
});

describe('waitUntilReady', () => {
  it('retries until ready and gives up on timeout', async () => {
    let n = 0;
    const flaky: Fetcher = async () => (++n < 3 ? res(503) : res(200));
    expect(await waitUntilReady('http://x', 20_000, flaky, async () => undefined)).toBe(true);
    expect(await waitUntilReady('http://x', 6_000, async () => res(503), async () => undefined)).toBe(false);
  });
});

describe('decideRollback / watch', () => {
  const ok = { ok: true, failed: [] };
  const bad = { ok: false, failed: ['x'] };
  it('rolls back after 3 consecutive failures only', () => {
    expect(decideRollback([bad, bad, ok, bad, bad]).rollback).toBe(false);
    expect(decideRollback([ok, bad, bad, bad]).rollback).toBe(true);
  });
  it('stops early on rollback and survives a throwing probe', async () => {
    let calls = 0;
    const r = await watch({ probe: async () => (++calls, ['caído']), durationMs: 600_000, intervalMs: 1000, sleep: async () => undefined });
    expect(r.rollback).toBe(true);
    expect(calls).toBe(3);
    const t = await watch({ probe: async () => { throw new Error('boom'); }, durationMs: 5000, intervalMs: 1000, sleep: async () => undefined });
    expect(t.rollback).toBe(true);
  });
  it('stays green when healthy for the whole period', async () => {
    const r = await watch({ probe: async () => [], durationMs: 3000, intervalMs: 1000, sleep: async () => undefined });
    expect(r).toEqual({ rollback: false, probes: 3 });
  });
});

function fakeDeployer(initial: Partial<Record<Env, string>> = {}, failOn?: { env: Env; version: string }) {
  const versions: Partial<Record<Env, string>> = { ...initial };
  const calls: string[] = [];
  const d: Deployer = {
    currentVersion: async (env) => versions[env] ?? null,
    deploy: async (env, version) => {
      calls.push(`${env}:${version}`);
      if (failOn && failOn.env === env && failOn.version === version) throw new Error('docker caído');
      versions[env] = version;
    },
  };
  return { d, calls, versions };
}
function steps(over: Partial<ReleaseSteps> = {}): ReleaseSteps & { notes: string[] } {
  const notes: string[] = [];
  return { smoke: async () => [], e2e: async () => true, watch: async () => ({ rollback: false }), notify: async (m) => void notes.push(m), notes, ...over };
}
const base = { version: 'v2', target: 'production' as Env, ownerApproved: true, stopped: false };

describe('runRelease', () => {
  it('deploys to staging then production and records success', async () => {
    const { d, calls } = fakeDeployer({ production: 'v1' });
    const r = await runRelease({ ...base, deployer: d, steps: steps() });
    expect(r.status).toBe('desplegado');
    expect(calls).toEqual(['staging:v2', 'production:v2']);
  });

  it('blocks production without the owner and never touches it', async () => {
    const { d, calls } = fakeDeployer({ production: 'v1' });
    const s = steps();
    const r = await runRelease({ ...base, ownerApproved: false, deployer: d, steps: s });
    expect(r.status).toBe('bloqueado');
    expect(calls).toEqual(['staging:v2']);
    expect(s.notes[0]).toContain('aprobación del dueño');
  });

  it('refuses everything with the emergency switch on', async () => {
    const { d, calls } = fakeDeployer();
    await expect(runRelease({ ...base, stopped: true, deployer: d, steps: steps() })).rejects.toThrow(/emergencia/);
    expect(calls).toEqual([]);
  });

  it('stops at staging when smoke or e2e fail, and restores staging', async () => {
    for (const s of [steps({ smoke: async () => ['/login respondió 500'] }), steps({ e2e: async () => false })]) {
      const { d, calls } = fakeDeployer({ staging: 'v1', production: 'v1' });
      const r = await runRelease({ ...base, deployer: d, steps: s });
      expect(r.status).toBe('fallo-staging');
      expect(calls).toEqual(['staging:v2', 'staging:v1']);
      expect(s.notes[0]).toContain('Producción no se tocó');
    }
  });

  it('does not run e2e when smoke already failed', async () => {
    let e2eRan = false;
    const { d } = fakeDeployer();
    await runRelease({ ...base, deployer: d, steps: steps({ smoke: async () => ['x'], e2e: async () => ((e2eRan = true), true) }) });
    expect(e2eRan).toBe(false);
  });

  it('rolls production back to the previous version when the watch fails', async () => {
    const { d, calls, versions } = fakeDeployer({ production: 'v1' });
    const s = steps({ watch: async (env) => (env === 'production' ? { rollback: true, reason: '3 fallos seguidos' } : { rollback: false }) });
    const r = await runRelease({ ...base, deployer: d, steps: s });
    expect(r.status).toBe('revertido');
    expect(calls.at(-1)).toBe('production:v1');
    expect(versions.production).toBe('v1');
    expect(s.notes.join()).toContain('revirtió de v2 a v1');
  });

  it('rolls back when production smoke fails right after deploy', async () => {
    const { d } = fakeDeployer({ production: 'v1' });
    const s = steps({ smoke: async (env) => (env === 'production' ? ['/ respondió 500'] : []) });
    expect((await runRelease({ ...base, deployer: d, steps: s })).status).toBe('revertido');
  });

  it('escalates, never claims success, with no previous version or a failing rollback', async () => {
    const failing = steps({ watch: async () => ({ rollback: true, reason: 'caído' }) });
    const a = fakeDeployer();
    expect((await runRelease({ ...base, deployer: a.d, steps: failing })).status).toBe('revertido-fallo');
    expect(failing.notes.join()).toContain('no hay versión anterior');

    const failing2 = steps({ watch: async (env) => (env === 'production' ? { rollback: true, reason: 'caído' } : { rollback: false }) });
    const b = fakeDeployer({ production: 'v1' }, { env: 'production', version: 'v1' });
    expect((await runRelease({ ...base, deployer: b.d, steps: failing2 })).status).toBe('revertido-fallo');
    expect(failing2.notes.join()).toContain('reversión de producción a v1 falló');
  });
});
