// Deploy CLI: staging-env, smoke, verify, release.
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { isStopped } from '../factory/store.ts';
import { composeDeployer } from './compose.ts';
import { runRelease, type Env } from './release.ts';
import { smokeCheck, waitUntilReady } from './smoke.ts';
import { watch } from './verify.ts';

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
const [cmd, ...rest] = process.argv.slice(2);
const STATE = process.env.FACTORY_STATE_DIR ?? '.factory-state';
const arg = (n: string): string | undefined => {
  const i = rest.indexOf(`--${n}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

async function main() {
  if (cmd === 'staging-env') {
    // Throwaway synthetic secrets for staging. Printed as KEY=VALUE; never reuse them anywhere else.
    const values = {
      POSTGRES_PASSWORD: randomBytes(12).toString('hex'),
      AUTH_SECRET: randomBytes(24).toString('base64'),
      MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      METRICS_TOKEN: randomBytes(16).toString('hex'),
    };
    const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n');
    const out = arg('out');
    if (out) {
      writeFileSync(out, `${lines}\n`, { mode: 0o600 });
      console.log(`Secretos sintéticos de staging escritos en ${out}`);
    } else console.log(lines);
  } else if (cmd === 'smoke') {
    const url = arg('url') ?? 'http://localhost:3200';
    if (!(await waitUntilReady(url, Number(arg('wait') ?? 60) * 1000))) {
      console.error(`✘ ${url} no estuvo listo a tiempo`);
      process.exit(1);
    }
    const failed = await smokeCheck(url);
    if (failed.length) {
      console.error(failed.map((f) => `✘ ${f}`).join('\n'));
      process.exit(1);
    }
    console.log(`Pruebas de humo en verde: ${url}`);
  } else if (cmd === 'verify') {
    const url = need('url');
    const r = await watch({ probe: () => smokeCheck(url), durationMs: Number(arg('duration') ?? 300) * 1000, intervalMs: Number(arg('interval') ?? 15) * 1000 });
    console.log(JSON.stringify(r));
    process.exit(r.rollback ? 4 : 0);
  } else if (cmd === 'release') {
    const version = need('version');
    const target = (arg('env') ?? 'staging') as Env;
    const urls: Record<Env, string> = { staging: process.env.STAGING_URL ?? 'http://localhost:3200', production: process.env.PRODUCTION_URL ?? '' };
    const deployer = composeDeployer(
      {
        staging: { file: 'infra/staging/docker-compose.yml', envFile: process.env.STAGING_ENV_FILE },
        production: { file: process.env.PRODUCTION_COMPOSE_FILE ?? 'infra/docker-compose.yml', envFile: process.env.PRODUCTION_ENV_FILE, context: process.env.PRODUCTION_DOCKER_CONTEXT },
      },
      STATE,
    );
    if (target === 'production' && !urls.production) throw new Error('Falta PRODUCTION_URL: producción aún no tiene destino configurado');
    const result = await runRelease({
      deployer,
      version,
      target,
      ownerApproved: rest.includes('--owner-approved'),
      stopped: isStopped(STATE),
      steps: {
        smoke: async (env) => ((await waitUntilReady(urls[env], 90_000)) ? smokeCheck(urls[env]) : [`${urls[env]} no estuvo listo a tiempo`]),
        e2e: async () => spawnSync('pnpm', ['--filter', '@factory/e2e', 'test'], { stdio: 'inherit', env: { ...process.env, E2E_BASE_URL: urls.staging } }).status === 0,
        watch: (env) => watch({ probe: () => smokeCheck(urls[env]), durationMs: Number(arg('watch') ?? 300) * 1000, intervalMs: 15_000 }),
        notify: async (m) => console.error(`AVISO AL DUEÑO: ${m}`),
      },
    });
    mkdirSync(STATE, { recursive: true });
    appendFileSync(`${STATE}/releases.jsonl`, `${JSON.stringify({ at: new Date().toISOString(), version, target, status: result.status })}\n`);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'desplegado' ? 0 : result.status === 'bloqueado' ? 5 : 1);
  } else {
    console.error('Uso: rollout staging-env|smoke|verify|release');
    process.exit(2);
  }
}

function need(n: string): string {
  const v = arg(n);
  if (!v) {
    console.error(`Falta --${n}`);
    process.exit(2);
  }
  return v;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
