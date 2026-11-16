// Smoke checks against a running environment. Fetch is injected so the logic is testable without a server.
export interface Res {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}
export type Fetcher = (url: string) => Promise<Res>;

const SECURITY_HEADERS: [string, RegExp][] = [
  ['content-security-policy', /default-src|script-src/],
  ['x-content-type-options', /^nosniff$/i],
  ['x-frame-options', /^(deny|sameorigin)$/i],
  ['referrer-policy', /.+/],
];

const defaultFetch: Fetcher = async (url) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });

// Returns the list of failed checks; an empty list means healthy.
export async function smokeCheck(baseUrl: string, fetcher: Fetcher = defaultFetch): Promise<string[]> {
  const base = baseUrl.replace(/\/$/, '');
  const failed: string[] = [];
  const get = async (path: string): Promise<Res | null> => {
    try {
      return await fetcher(`${base}${path}`);
    } catch (e) {
      failed.push(`${path}: sin respuesta (${e instanceof Error ? e.message : String(e)})`);
      return null;
    }
  };

  const live = await get('/api/health/live');
  if (live && live.status !== 200) failed.push(`/api/health/live respondió ${live.status}`);

  const ready = await get('/api/health/ready');
  if (ready) {
    if (ready.status !== 200) failed.push(`/api/health/ready respondió ${ready.status}`);
    else {
      try {
        if ((JSON.parse(await ready.text()) as { ready?: boolean }).ready !== true) failed.push('/api/health/ready no dice ready=true');
      } catch {
        failed.push('/api/health/ready no devolvió JSON');
      }
    }
  }

  const home = await get('/');
  if (home) {
    if (home.status !== 200) failed.push(`/ respondió ${home.status}`);
    for (const [name, pattern] of SECURITY_HEADERS) {
      const v = home.headers.get(name);
      if (!v || !pattern.test(v)) failed.push(`falta la cabecera de seguridad ${name}`);
    }
    if (base.startsWith('https://') && !home.headers.get('strict-transport-security')) failed.push('falta la cabecera de seguridad strict-transport-security');
  }

  const login = await get('/login');
  if (login && login.status !== 200) failed.push(`/login respondió ${login.status}`);

  const metrics = await get('/api/metrics');
  if (metrics && metrics.status !== 401) failed.push(`/api/metrics sin token respondió ${metrics.status} (debe ser 401)`);

  return failed;
}

// Waits until the app answers "ready" (containers take a few seconds after `up -d`). Returns true when ready in time.
export async function waitUntilReady(baseUrl: string, timeoutMs: number, fetcher: Fetcher = defaultFetch, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<boolean> {
  const base = baseUrl.replace(/\/$/, '');
  const attempts = Math.max(1, Math.ceil(timeoutMs / 2000));
  for (let i = 0; i < attempts; i++) {
    try {
      if ((await fetcher(`${base}/api/health/ready`)).status === 200) return true;
    } catch {
      // not up yet
    }
    if (i < attempts - 1) await sleep(2000);
  }
  return false;
}
