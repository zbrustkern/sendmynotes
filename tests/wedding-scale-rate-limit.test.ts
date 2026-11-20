import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

assert.equal(process.env.NODE_ENV, 'test');
assert.ok(process.env.SMN_TEST_DATA_DIR, 'Run with isolated SMN_TEST_DATA_DIR');

let checks = 0;
async function check(label: string, fn: () => Promise<void> | void) {
  await fn();
  checks++;
  console.log(`PASS ${label}`);
}

async function main() {
  const { firestoreDb, isFirestoreMock } = await import('../lib/firebase-admin');
  assert.equal(isFirestoreMock, true, 'Must use isolated mock Firestore');

  const { enforceWeddingNetworkRateLimit } = await import('../lib/wedding/rate-limit');
  const { createWeddingProject, weddingState } = await import('../lib/wedding/project');
  const { requireWeddingActor, WEDDING_COOKIE } = await import('../lib/wedding/server');
  const { claimImportAttempt } = await import('../lib/wedding/import-storage');
  const { createWeddingArtworkHandlers } = await import('../lib/wedding/artwork-http');
  const { createWeddingAiService } = await import('../lib/wedding/ai');
  const { syntheticWeddingAiProvider } = await import('./fixtures/wedding-ai-provider');
  const ProjectRoute = await import('../app/api/wedding/project/route');
  const ImportRoute = await import('../app/api/wedding/import/route');

  const secret = 'test-network-hash-secret-at-least-24-chars';

  await check('rate limiter allows local/test cleanly when network source is unset', async () => {
    delete process.env.K_SERVICE;
    delete process.env.PROMOTION_NETWORK_SOURCE;
    delete process.env.PROMOTION_NETWORK_HASH_SECRET;
    await enforceWeddingNetworkRateLimit(new Request('https://wedding.test/api/wedding/project'), 'start');
  });

  await check('rate limiter fails closed when K_SERVICE or PROMOTION_NETWORK_SOURCE is misconfigured', async () => {
    try {
      process.env.K_SERVICE = 'sendmynotes-staging';
      await assert.rejects(
        () => enforceWeddingNetworkRateLimit(new Request('https://wedding.test/api/wedding/project'), 'start'),
        (e: any) => e.code === 'network_validation_unconfigured' && e.status === 503,
      );
      delete process.env.K_SERVICE;

      process.env.PROMOTION_NETWORK_SOURCE = 'firebase-app-hosting';
      process.env.PROMOTION_NETWORK_HASH_SECRET = secret;
      await assert.rejects(
        () => enforceWeddingNetworkRateLimit(new Request('https://wedding.test/api/wedding/project'), 'start'),
        (e: any) => e.code === 'network_validation_unavailable' && e.status === 503,
      );
      await assert.rejects(
        () =>
          enforceWeddingNetworkRateLimit(
            new Request('https://wedding.test/api/wedding/project', { headers: { 'x-fah-client-ip': 'not-an-ip' } }),
            'start',
          ),
        (e: any) => e.code === 'network_validation_unavailable' && e.status === 503,
      );
    } finally {
      delete process.env.K_SERVICE;
      delete process.env.PROMOTION_NETWORK_SOURCE;
      delete process.env.PROMOTION_NETWORK_HASH_SECRET;
    }
  });

  await check('hashed-IP rate limiter enforces 30/min start, 30/min import, 60/min artwork and canonicalizes IPv6', async () => {
    try {
      process.env.PROMOTION_NETWORK_SOURCE = 'firebase-app-hosting';
      process.env.PROMOTION_NETWORK_HASH_SECRET = secret;
      const now = 1_794_000_000_000;
      const reqStartV6a = new Request('https://wedding.test/api/wedding/project', {
        headers: { 'x-fah-client-ip': '2001:0db8:0000:0000:0000:0000:0000:0001' },
      });
      const reqStartV6b = new Request('https://wedding.test/api/wedding/project', {
        headers: { 'x-fah-client-ip': '2001:db8::1' },
      });
      for (let i = 0; i < 30; i++) {
        await enforceWeddingNetworkRateLimit(i % 2 === 0 ? reqStartV6a : reqStartV6b, 'start', now);
      }
      await assert.rejects(
        () => enforceWeddingNetworkRateLimit(reqStartV6b, 'start', now),
        (e: any) => e.code === 'rate_limited' && e.status === 429,
      );

      // Next minute window resets cleanly.
      await enforceWeddingNetworkRateLimit(reqStartV6b, 'start', now + 60_000);

      // Artwork bucket allows 60/min for a distinct IP, rejects 61st.
      const reqArt = new Request('https://wedding.test/api/wedding/artwork', {
        headers: { 'x-fah-client-ip': '203.0.113.10' },
      });
      for (let i = 0; i < 60; i++) {
        await enforceWeddingNetworkRateLimit(reqArt, 'artwork', now);
      }
      await assert.rejects(
        () => enforceWeddingNetworkRateLimit(reqArt, 'artwork', now),
        (e: any) => e.code === 'rate_limited' && e.status === 429,
      );

      // Import bucket allows 30/min, rejects 31st.
      const reqImport = new Request('https://wedding.test/api/wedding/import', {
        headers: { 'x-fah-client-ip': '203.0.113.11' },
      });
      for (let i = 0; i < 30; i++) {
        await enforceWeddingNetworkRateLimit(reqImport, 'import', now);
      }
      await assert.rejects(
        () => enforceWeddingNetworkRateLimit(reqImport, 'import', now),
        (e: any) => e.code === 'rate_limited' && e.status === 429,
      );
    } finally {
      delete process.env.PROMOTION_NETWORK_SOURCE;
      delete process.env.PROMOTION_NETWORK_HASH_SECRET;
    }
  });

  await check('16-shard start limits allow 240+ starts/hour across shards while bounding per-shard at 150', async () => {
    const hour = Math.floor(Date.now() / 3_600_000);
    // Pre-fill shards 0..15 with 149 weight each (2384 total weight) and verify creates still succeed on every shard.
    for (let s = 0; s < 16; s++) {
      await firestoreDb.collection('weddingStartLimits').doc(`deployment_${hour}_s${s}`).set({
        used: 149,
        expiresAt: (hour + 1) * 3_600_000,
      });
    }
    const created = await createWeddingProject(`device_shard_${randomUUID()}`, false, { shard: 3 });
    assert.ok(created.projectId.startsWith('wp_'));
    await assert.rejects(
      () => createWeddingProject(`device_shard_${randomUUID()}`, false, { shard: 3 }),
      (e: any) => e.code === 'project_intake_busy' && e.status === 429,
    );
    // Another shard still accepts starts cleanly.
    const other = await createWeddingProject(`device_shard_${randomUUID()}`, false, { shard: 4 });
    assert.ok(other.projectId.startsWith('wp_'));
    for (let sIdx = 0; sIdx < 16; sIdx++) {
      await firestoreDb.collection('weddingStartLimits').doc(`deployment_${hour}_s${sIdx}`).delete();
    }
  });

  await check('8-shard import quotas allow >6 concurrent global imports across shards', async () => {
    const releases: Array<() => Promise<unknown>> = [];
    try {
      for (let s = 0; s < 8; s++) {
        for (let k = 0; k < 2; k++) {
          releases.push(await claimImportAttempt(`proj_${s}_${k}`, s));
        }
      }
      assert.equal(releases.length, 16);
    } finally {
      await Promise.all(releases.map((r) => r()));
    }
  });

  await check('cold guest can upload artwork and import CSV without pilot invite', async () => {
    const created = await createWeddingProject(`cold_guest_${randomUUID()}`);
    const origin = 'https://wedding.test';
    const form = new FormData();
    form.append('file', new File([Buffer.from('synthetic-png')], 'cover.png', { type: 'image/png' }));
    const artReq = new NextRequest(`${origin}/api/wedding/artwork`, {
      method: 'POST',
      headers: { host: 'wedding.test', origin },
      body: form,
    });
    const artHandlers = createWeddingArtworkHandlers(
      async () => ({ projectId: created.projectId, actorId: created.actorId, pilot: false, verified: false }),
      {
        intake: async (_projectId, readFile) => {
          await readFile();
          return { assetId: 'art_cold_guest', url: '/api/wedding/artwork?id=art_cold_guest' };
        },
        compose: async () => ({ assetId: 'art_cold_guest', url: '/api/wedding/artwork?id=art_cold_guest' }),
        read: async () => Buffer.from(''),
        adopt: async () => ({ assetId: 'art_cold_guest', url: '/api/wedding/artwork?id=art_cold_guest' }),
      },
    );
    const artRes = await artHandlers.POST(artReq);
    assert.equal(artRes.status, 201);

    const csvReq = new NextRequest(`${origin}/api/wedding/import?format=csv`, {
      method: 'POST',
      headers: {
        host: 'wedding.test',
        origin,
        cookie: `${WEDDING_COOKIE}=${created.token}`,
      },
      body: 'Name,Gift\n"Alex & Sam","Serving bowl"',
    });
    const csvRes = await ImportRoute.POST(csvReq);
    assert.equal(csvRes.status, 200);
    const csvJson = await csvRes.json();
    assert.equal(csvJson.counts.households, 1);
  });

  await check('AI requires verified sign-in step-up and calibrates deployment limits cleanly', async () => {
    const created = await createWeddingProject(`ai_stepup_${randomUUID()}`);
    const actor = await requireWeddingActor(
      new Request('https://wedding.test/api/wedding/project', {
        headers: { cookie: `${WEDDING_COOKIE}=${created.token}` },
      }),
    );
    assert.equal(actor.verified, false);
    assert.equal(actor.pilot, false);

    const provider = syntheticWeddingAiProvider();
    const service = createWeddingAiService({ provider, testRuntime: true });
    const ctx = {
      actor,
      deviceId: `dev_${randomUUID()}`,
      signal: new AbortController().signal,
      reauthorize: async () => actor,
    };

    await assert.rejects(
      () => service.post(ctx, { action: 'map', headers: ['Gift'], consent: true, idempotencyKey: randomUUID() }),
      (e: any) => e.code === 'ai_sign_in_required' && e.status === 401,
    );
    assert.equal(provider.calls.length, 0);

    const verifiedActor = { ...actor, verified: true };
    const verifiedCtx = { ...ctx, actor: verifiedActor, reauthorize: async () => verifiedActor };
    const mapped = await service.post(verifiedCtx, {
      action: 'map',
      headers: ['Gift'],
      consent: true,
      idempotencyKey: randomUUID(),
    });
    assert.deepEqual(mapped, { mapping: { Gift: 'gift' } });
    const meta = await service.get(verifiedCtx);
    assert.equal(meta.cost.ceilingCents, 1500);
  });

  await check('project create sanitizes and persists attribution while honoring GPC/opt-out', async () => {
    const origin = 'https://wedding.test';
    const createReq = new Request(`${origin}/api/wedding/project`, {
      method: 'POST',
      headers: { host: 'wedding.test', origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        attribution: {
          utmSource: 'meta',
          utmMedium: 'paid_social',
          utmCampaign: 'wedding_launch user@example.com',
          fbclid: 'IwAR123456',
          gclid: 'Cj0KCQ_test',
          referrer: 'https://l.instagram.com/?u=secret@example.com',
          landingPath: '/thank-you/wedding?fbclid=abc',
          unexpectedSecret: 'drop-me',
        },
      }),
    });
    const res = await ProjectRoute.POST(createReq);
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.project.attribution.utmSource, 'meta');
    assert.equal(data.project.attribution.utmMedium, 'paid_social');
    assert.equal(data.project.attribution.utmCampaign, 'wedding_launch');
    assert.equal(data.project.attribution.fbclid, 'IwAR123456');
    assert.equal(data.project.attribution.gclid, 'Cj0KCQ_test');
    assert.equal(data.project.attribution.referrer, 'https://l.instagram.com/');
    assert.equal(data.project.attribution.landingPath, '/thank-you/wedding');
    assert.equal(data.project.attribution.unexpectedSecret, undefined);

    const gpcReq = new Request(`${origin}/api/wedding/project`, {
      method: 'POST',
      headers: { host: 'wedding.test', origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        attribution: { gpc: true, fbclid: 'should_not_persist', utmSource: 'meta' },
      }),
    });
    const gpcRes = await ProjectRoute.POST(gpcReq);
    assert.equal(gpcRes.status, 201);
    const gpcData = await gpcRes.json();
    assert.deepEqual(gpcData.project.attribution, { gpc: true });
    assert.ok(await weddingState(await requireWeddingActor(
      new Request(`${origin}/api/wedding/project`, {
        headers: { cookie: gpcRes.headers.get('set-cookie')?.split(';')[0] || '' },
      }),
    )));
  });

  console.log(`Passed ${checks} wedding scale & rate-limit checks.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
