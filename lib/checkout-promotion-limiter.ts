import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import type { NextRequest, NextResponse } from 'next/server';
import { firestoreDb } from './firebase-admin';

export const PROMOTION_SESSION_COOKIE = 'smn_offer_session';
const WINDOW_MS = 60_000;
const SESSION_LIMIT = 20;
const NETWORK_LIMIT = 60;

export async function takePromotionAttempt(req: NextRequest, now = Date.now()) {
  const prior = req.cookies.get(PROMOTION_SESSION_COOKIE)?.value;
  const session = prior && /^[a-f0-9]{48}$/.test(prior) ? prior : randomBytes(24).toString('hex');
  const hops = Number(process.env.PROMOTION_TRUSTED_PROXY_HOPS || 0);
  const forwarded = Number.isInteger(hops) && hops >= 1 && hops <= 5
    ? req.headers.get('x-forwarded-for')?.split(',').at(-hops)?.trim() || ''
    : '';
  const network = isIP(forwarded) ? forwarded : 'shared';
  const secret = process.env.PROMOTION_NETWORK_HASH_SECRET;
  const window = Math.floor(now / WINDOW_MS);
  const networkBucket = secret ? createHmac('sha256', secret).update(`offer-network:${Math.floor(now / 86_400_000)}:${network}`).digest('hex') : 'shared';
  const buckets = [
    { id: `network_${networkBucket}`, limit: NETWORK_LIMIT },
    { id: `session_${session}`, limit: SESSION_LIMIT },
  ];
  const allowed = await firestoreDb.runTransaction(async (transaction) => {
    const refs = buckets.map(({ id }) => firestoreDb.collection('promotion_attempt_limits').doc(id));
    const reads = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const counts = reads.map((read) => read.data()?.window === window ? Number(read.data()?.count || 0) : 0);
    if (buckets.some(({ limit }, index) => counts[index] >= limit)) return false;
    refs.forEach((ref, index) => transaction.set(ref, { window, count: counts[index] + 1, expiresAt: new Date(now + 86_400_000) }));
    return true;
  });
  return { allowed, session, retryAfter: Math.ceil(((window + 1) * WINDOW_MS - now) / 1000) };
}

export function setPromotionSession(response: NextResponse, session: string) {
  response.cookies.set(PROMOTION_SESSION_COOKIE, session, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 86_400,
  });
  return response;
}
