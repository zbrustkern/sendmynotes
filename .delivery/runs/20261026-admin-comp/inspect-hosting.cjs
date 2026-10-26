const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const firebaseToolsLib = '/Users/zeke/.nvm/versions/node/v20.12.1/lib/node_modules/firebase-tools/lib/';
const outputDir = path.join(__dirname, 'checks');
fs.mkdirSync(outputDir, { recursive: true });

const phase = process.argv[2] || 'before';
if (!/^[a-z-]+$/.test(phase)) throw new Error('Invalid evidence phase');
const surfaces = [
  { name: 'staging', project: 'sendmynotes-staging', backend: 'sendmynotes-staging' },
  { name: 'production', project: 'sendmynotes-2a417', backend: 'sendmynotes' },
];
const visibleFlags = new Set([
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_STAGING_REVIEW_ONLY',
  'STAGING_REVIEW_ONLY',
  'HANDWRYTTEN_TEST_MODE',
  'INTERNATIONAL_MAILING_PREVIEW',
  'FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
]);
const paymentEnvNames = new Set([
  'STRIPE_SECRET_KEY',
  'STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET',
]);

function stableEnvEntry(entry) {
  return {
    name: entry.name || '',
    value: typeof entry.value === 'string' ? entry.value : null,
    secretRef: entry.valueSource?.secretKeyRef ? {
      secret: entry.valueSource.secretKeyRef.secret || '',
      version: entry.valueSource.secretKeyRef.version || '',
    } : null,
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function readSurface(surface) {
  const account = require(firebaseToolsLib + 'auth').getGlobalDefaultAccount();
  await require(firebaseToolsLib + 'requireAuth').requireAuth({
    ...account,
    project: surface.project,
    projectId: surface.project,
    nonInteractive: true,
  });
  const apphosting = require(firebaseToolsLib + 'gcp/apphosting');
  const backendInfo = await apphosting.getBackend(surface.project, 'us-central1', surface.backend);
  const trafficPolicy = (await apphosting.client.get(`projects/${surface.project}/locations/us-central1/backends/${surface.backend}/traffic`)).body;
  const rollouts = (await apphosting.listRollouts(surface.project, 'us-central1', surface.backend)).rollouts || [];
  rollouts.sort((a, b) => (b.createTime || '').localeCompare(a.createTime || ''));
  const latest = rollouts[0];
  if (!latest?.build) throw new Error(`${surface.name}: no rollout build returned`);
  const build = await apphosting.getBuild(surface.project, 'us-central1', surface.backend, latest.build.split('/').pop());
  const { Client } = require(firebaseToolsLib + 'apiv2');
  const api = new Client({ urlPrefix: 'https://run.googleapis.com', auth: true, apiVersion: 'v2' });
  const service = (await api.get(`projects/${surface.project}/locations/us-central1/services/${surface.backend}`)).body;
  const env = (service.template?.containers?.[0]?.env || []).map(stableEnvEntry).sort((a, b) => a.name.localeCompare(b.name));
  const paymentEnv = env.filter((entry) => paymentEnvNames.has(entry.name));
  const safe = {
    checkedAt: new Date().toISOString(),
    project: surface.project,
    backend: surface.backend,
    environment: backendInfo.environment || null,
    rolloutPolicy: trafficPolicy.rolloutPolicy || null,
    rollout: {
      name: latest.name || null,
      state: latest.state || null,
      build: latest.build,
    },
    build: {
      name: build.name || latest.build,
      state: build.state || null,
      sourceBranch: build.source?.codebase?.branch || null,
      sourceSha: build.source?.codebase?.hash || build.source?.codebase?.displayName || null,
      commitTime: build.source?.codebase?.commitTime || null,
    },
    service: {
      latestReadyRevision: service.latestReadyRevision || null,
      trafficStatuses: (service.trafficStatuses || [])
        .filter((status) => typeof status.percent === 'number' && status.percent > 0)
        .map((status) => ({ revision: status.revision || null, percent: status.percent })),
    },
    flags: env.filter((entry) => visibleFlags.has(entry.name)).map((entry) => ({ name: entry.name, value: entry.value })),
    environmentSha256: digest(env),
    stableEnvironmentSha256: digest(env.filter((entry) => entry.name !== 'NG_ALLOWED_HOSTS')),
    paymentConfigurationSha256: digest(paymentEnv),
    secretValuesLogged: false,
  };
  fs.writeFileSync(path.join(outputDir, `${surface.name}-${phase}.json`), JSON.stringify(safe, null, 2));
  return safe;
}

(async () => {
  const results = [];
  for (const surface of surfaces) results.push(await readSurface(surface));
  console.log(JSON.stringify(results.map((result) => ({
    project: result.project,
    backend: result.backend,
    environment: result.environment,
    rolloutPolicy: result.rolloutPolicy,
    rollout: result.rollout,
    build: result.build,
    service: result.service,
    flags: result.flags,
    environmentSha256: result.environmentSha256,
    paymentConfigurationSha256: result.paymentConfigurationSha256,
    secretValuesLogged: result.secretValuesLogged,
  }))));
})().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Hosting inspection failed');
  process.exitCode = 1;
});
