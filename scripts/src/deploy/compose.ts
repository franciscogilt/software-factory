// Docker Compose deployer: works on any Docker host or context, so no cloud provider is tied to the product.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Deployer, Env } from './release.ts';

export interface ComposeTarget {
  file: string; // compose file for this environment
  envFile?: string; // variables (secrets live outside the repository)
  context?: string; // docker context, for a remote host
}

export function composeDeployer(targets: Record<Env, ComposeTarget>, stateDir: string): Deployer {
  const versionFile = (env: Env) => join(stateDir, `version-${env}.txt`);
  return {
    async currentVersion(env) {
      return existsSync(versionFile(env)) ? readFileSync(versionFile(env), 'utf8').trim() || null : null;
    },
    async deploy(env, version) {
      const t = targets[env];
      const args = [...(t.context ? ['--context', t.context] : []), 'compose', '-f', t.file, ...(t.envFile ? ['--env-file', t.envFile] : []), 'up', '-d', '--remove-orphans'];
      execFileSync('docker', args, { stdio: 'inherit', env: { ...process.env, IMAGE_TAG: version } });
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(versionFile(env), `${version}\n`);
    },
  };
}
