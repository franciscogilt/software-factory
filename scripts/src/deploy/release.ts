// Release flow: staging first, then production only with the owner's approval, then watch and roll back on failure.
export type Env = 'staging' | 'production';

export interface Deployer {
  currentVersion(env: Env): Promise<string | null>;
  deploy(env: Env, version: string): Promise<void>;
}

export interface ReleaseSteps {
  smoke(env: Env): Promise<string[]>;
  e2e(): Promise<boolean>;
  watch(env: Env): Promise<{ rollback: boolean; reason?: string }>;
  notify(message: string): Promise<void>;
}

export type ReleaseStatus = 'desplegado' | 'bloqueado' | 'fallo-staging' | 'revertido' | 'revertido-fallo';

export interface ReleaseResult {
  status: ReleaseStatus;
  log: string[];
}

export async function runRelease(opts: {
  deployer: Deployer;
  version: string;
  target: Env;
  ownerApproved: boolean;
  stopped: boolean;
  steps: ReleaseSteps;
}): Promise<ReleaseResult> {
  const { deployer, steps, version } = opts;
  const log: string[] = [];
  if (opts.stopped) throw new Error('Interruptor de emergencia activo: no se despliega nada');

  // 1) Staging, always. A failure there never reaches production.
  const stagingBefore = await deployer.currentVersion('staging');
  await deployer.deploy('staging', version);
  log.push(`staging: desplegado ${version}`);
  const smoke = await steps.smoke('staging');
  const e2eOk = smoke.length === 0 ? await steps.e2e() : false;
  if (smoke.length > 0 || !e2eOk) {
    const why = smoke.length > 0 ? `humo falló: ${smoke.join('; ')}` : 'las pruebas e2e fallaron';
    log.push(`staging: ${why}`);
    if (stagingBefore) await deployer.deploy('staging', stagingBefore);
    await steps.notify(`El lanzamiento ${version} se detuvo en staging: ${why}. Producción no se tocó.`);
    return { status: 'fallo-staging', log };
  }
  log.push('staging: humo y e2e en verde');
  if (opts.target === 'staging') return { status: 'desplegado', log };

  // 2) Production needs the owner. Nothing here can approve on their behalf.
  if (!opts.ownerApproved) {
    log.push('producción: falta la aprobación del dueño');
    await steps.notify(`El lanzamiento ${version} pasó staging y espera la aprobación del dueño para producción.`);
    return { status: 'bloqueado', log };
  }
  const previous = await deployer.currentVersion('production');
  await deployer.deploy('production', version);
  log.push(`producción: desplegado ${version} (anterior: ${previous ?? 'ninguna'})`);

  const smokeProd = await steps.smoke('production');
  const watched = smokeProd.length === 0 ? await steps.watch('production') : { rollback: true, reason: `humo falló: ${smokeProd.join('; ')}` };
  if (!watched.rollback) {
    log.push('producción: vigilancia en verde');
    return { status: 'desplegado', log };
  }

  // 3) Automatic rollback.
  log.push(`producción: ${watched.reason}`);
  if (!previous) {
    await steps.notify(`Producción falló con ${version} y no hay versión anterior a la que volver: ${watched.reason}. Se necesita al dueño ya.`);
    return { status: 'revertido-fallo', log };
  }
  try {
    await deployer.deploy('production', previous);
    log.push(`producción: revertido a ${previous}`);
    await steps.notify(`Producción se revirtió de ${version} a ${previous} automáticamente: ${watched.reason}.`);
    return { status: 'revertido', log };
  } catch (e) {
    await steps.notify(`La reversión de producción a ${previous} falló (${e instanceof Error ? e.message : String(e)}). Se necesita al dueño ya.`);
    return { status: 'revertido-fallo', log };
  }
}
