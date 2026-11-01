// Read-only staging Stripe provenance diagnostic. Run from this file's directory.
// Never writes credentials or customer data; only sanitized results are persisted.
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const project = 'sendmynotes-staging';
const region = 'us-central1';
const serviceName = 'sendmynotes-staging';
const piId = process.argv[2] || '';
if (piId && !/^pi_[A-Za-z0-9]+$/.test(piId)) throw new Error('Expected an explicitly supplied PaymentIntent ID (pi_...).');

function runGcloud(args, timeout) {
  return cp.execFileSync('/Users/zeke/Downloads/google-cloud-sdk/bin/gcloud', args, {
    encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

async function googleRead(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': project },
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google read failed for ${new URL(url).pathname} (HTTP ${response.status}); details suppressed.`);
  return data;
}

async function stripeRead(pathname, key) {
  const response = await fetch(`https://api.stripe.com/v1/${pathname}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Stripe read failed (HTTP ${response.status}, type=${data.error?.type || 'unknown'}, code=${data.error?.code || 'unknown'}); details suppressed.`);
  return data;
}

const sha256 = value => crypto.createHash('sha256').update(value || '').digest('hex');
const keyClass = key => key.startsWith('sk_test_') ? 'standard_test'
  : key.startsWith('rk_test_') ? 'restricted_test'
    : key.startsWith('sk_live_') ? 'standard_live'
      : key.startsWith('rk_live_') ? 'restricted_live'
        : key.startsWith('pk_test_') ? 'publishable_test'
          : key.startsWith('pk_live_') ? 'publishable_live'
            : key ? 'unknown' : 'empty';

async function main() {
  const token = runGcloud(['auth', 'print-access-token'], 15000);
  const service = await googleRead(`https://run.googleapis.com/v2/projects/${project}/locations/${region}/services/${serviceName}`, token);
  const container = service.template?.containers?.[0];
  if (!container) throw new Error('Serving Cloud Run service has no first container; refusing to infer configuration.');
  const env = container.env || [];
  const find = name => env.find(entry => entry.name === name);
  const secretBinding = find('STRIPE_SECRET_KEY')?.valueSource?.secretKeyRef || null;
  if (!secretBinding?.secret) throw new Error('Serving service has no resolvable STRIPE_SECRET_KEY secret binding.');
  const secretName = secretBinding.secret.match(/(?:^|\/secrets\/)([^/]+)(?:\/versions\/[^/]+)?$/)?.[1];
  const secretVersion = secretBinding.version || secretBinding.secret.match(/\/versions\/([^/]+)$/)?.[1] || 'latest';
  if (!secretName) throw new Error('Serving service Stripe secret reference could not be parsed; refusing to guess.');
  const secretResource = `projects/${project}/secrets/${secretName}/versions/${secretVersion}`;
  const secretResponse = await googleRead(`https://secretmanager.googleapis.com/v1/${secretResource}:access`, token);
  const secretBytes = Buffer.from(secretResponse.payload?.data || '', 'base64');
  const secret = secretBytes.toString('utf8').trim();
  if (!secret) throw new Error('Referenced staging Stripe secret was empty; value suppressed.');
  const secretType = keyClass(secret);
  if (secretType !== 'standard_test' && secretType !== 'restricted_test') {
    throw new Error(`Refusing Stripe API reads because serving staging secret class is ${secretType}; expected a test secret.`);
  }

  const account = await stripeRead('account', secret);
  const domains = await stripeRead('payment_method_domains?limit=100', secret);
  const publishableNames = ['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'STRIPE_PUBLISHABLE_KEY', 'stripe-publishable-key'];
  const configuredPublishables = publishableNames.map(name => {
    const entry = find(name);
    return {
      name,
      configured: Boolean(entry && (entry.value || entry.valueSource?.secretKeyRef)),
      source: entry?.valueSource?.secretKeyRef
        ? 'secret-reference'
        : entry?.value
          ? 'runtime-value'
          : 'absent',
      valueClass: entry?.value ? keyClass(entry.value) : null,
      valueSha256: entry?.value ? sha256(entry.value) : null,
    };
  });
  const routePublishableCandidate = configuredPublishables.find(entry => entry.configured) || null;
  const codePath = path.resolve(__dirname, '../../../../app/api/checkout/create-intent/route.ts');
  const routeSource = fs.readFileSync(codePath, 'utf8');
  const testFallbackDeclared = /pk_test_[A-Za-z0-9]+/.test(routeSource) && /resolvedMode\s*===\s*["']stripe_test["']/.test(routeSource);
  const out = {
    checkedAt: new Date().toISOString(),
    serving: {
      project,
      service: serviceName,
      latestReadyRevision: service.latestReadyRevision || null,
      serviceUri: service.uri || null,
    },
    stripeSecretProvenance: {
      environmentVariable: 'STRIPE_SECRET_KEY',
      secretResource,
      configuredVersion: secretVersion,
      keyClass: secretType,
      valueSha256: sha256(secret),
      accountIdSha256: sha256(account.id || ''),
      accountCountry: account.country || null,
      accountDefaultCurrency: account.default_currency || null,
      accountBusinessType: account.business_type || null,
      livemode: false,
    },
    publishableKeyProvenance: {
      runtimeCandidates: configuredPublishables,
      firstConfiguredRuntimeCandidate: routePublishableCandidate?.name || null,
      testFallbackDeclaredInServingSource: testFallbackDeclared,
      fallbackWouldBeSelectedIfAllRuntimeCandidatesAbsent: !routePublishableCandidate && testFallbackDeclared,
      effectiveBrowserKeyVerifiableFromRuntimeService: Boolean(routePublishableCandidate?.source === 'runtime-value'),
      limitation: 'Cloud Run runtime inspection cannot prove a NEXT_PUBLIC key inlined at build time; browser key/account pairing remains unverified when runtime candidates are absent.',
    },
    paymentMethodDomains: (domains.data || []).map(domain => ({
      domain: domain.domain_name,
      applePay: domain.apple_pay?.status || null,
      googlePay: domain.google_pay?.status || null,
      link: domain.link?.status || null,
    })),
    intent: null,
    secretsLogged: false,
    customerRecordsQueried: false,
    writesPerformed: false,
  };
  if (piId) {
    const pi = await stripeRead(`payment_intents/${encodeURIComponent(piId)}`, secret);
    out.intent = {
      id: pi.id,
      livemode: pi.livemode,
      status: pi.status,
      amount: pi.amount,
      currency: pi.currency,
      paymentMethodTypes: pi.payment_method_types || [],
      paymentMethodConfigurationId: pi.payment_method_configuration_details?.id || null,
      created: pi.created,
      metadataOrderIdPresent: Boolean(pi.metadata?.orderId),
      receiptEmailPresent: Boolean(pi.receipt_email),
    };
  }
  const outputPath = path.join(__dirname, 'stripe-staging-runtime.json');
  fs.writeFileSync(outputPath, `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ outputPath, serving: out.serving, stripeSecretProvenance: out.stripeSecretProvenance, publishableKeyProvenance: out.publishableKeyProvenance, paymentMethodDomains: out.paymentMethodDomains, intent: out.intent, secretsLogged: false }, null, 2)}\n`);
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
