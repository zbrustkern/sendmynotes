import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { firestoreDb } from '../firebase-admin';
import { WeddingError } from './server';

export type WeddingRateLimitBucket = 'start' | 'artwork' | 'import';

interface BucketConfig {
  prefix: string;
  limit: number;
  windowMs: number;
  message: string;
}

const BUCKET_CONFIG: Record<WeddingRateLimitBucket, BucketConfig> = {
  start: {
    prefix: 'wedding_start',
    limit: 30,
    windowMs: 60_000,
    message: 'Too many project starts from this network. Wait a minute and try again.',
  },
  artwork: {
    prefix: 'wedding_artwork',
    limit: 60,
    windowMs: 60_000,
    message: 'Too many photo requests from this network. Wait a minute and try again.',
  },
  import: {
    prefix: 'wedding_import',
    limit: 30,
    windowMs: 60_000,
    message: 'Too many list import requests from this network. Wait a minute and try again.',
  },
};

function resolveHashedNetworkKey(req: Request, prefix: string, now: number): string | null {
  if (process.env.PROMOTION_NETWORK_SOURCE === 'firebase-app-hosting') {
    const address = req.headers.get('x-fah-client-ip')?.trim() ?? '';
    const family = isIP(address);
    const secret = process.env.PROMOTION_NETWORK_HASH_SECRET;
    if (!family || address.includes('%') || !secret || secret.length < 24) {
      throw new WeddingError('network_validation_unavailable', 'Network validation is unavailable.', 503);
    }
    const canonical = family === 6 ? new URL(`http://[${address}]`).hostname : address;
    const dayBucket = Math.floor(now / 86_400_000);
    return createHmac('sha256', secret)
      .update(`${prefix}:${dayBucket}:${canonical}`)
      .digest('hex');
  }
  if (process.env.K_SERVICE || process.env.PROMOTION_NETWORK_SOURCE) {
    throw new WeddingError('network_validation_unconfigured', 'Network validation is unconfigured.', 503);
  }
  return null;
}

/**
 * Enforce verified edge hashed-IP rate limiting on cold-traffic wedding endpoints.
 * Fails closed when Cloud Run / network source env vars are present without valid
 * edge IP headers or hash secret; cleanly permits local/test runs when unconfigured.
 */
export async function enforceWeddingNetworkRateLimit(
  req: Request,
  bucket: WeddingRateLimitBucket,
  now = Date.now(),
): Promise<void> {
  const config = BUCKET_CONFIG[bucket];
  const networkHash = resolveHashedNetworkKey(req, config.prefix, now);
  if (!networkHash) return;

  const window = Math.floor(now / config.windowMs);
  const docRef = firestoreDb.collection('weddingNetworkLimits').doc(`${config.prefix}_${networkHash}`);
  const allowed = await firestoreDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.data();
    const count = data?.window === window ? Number(data?.count || 0) : 0;
    if (count >= config.limit) return false;
    tx.set(docRef, {
      bucket: config.prefix,
      window,
      count: count + 1,
      expiresAt: now + 86_400_000,
    });
    return true;
  });

  if (!allowed) {
    throw new WeddingError('rate_limited', config.message, 429);
  }
}
