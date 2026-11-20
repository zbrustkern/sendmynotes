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
  const window = Math.floor(now / WINDOW_MS);
  const buckets = [{ id: `session_${session}`, limit: SESSION_LIMIT }];
  if (process.env.PROMOTION_NETWORK_SOURCE === 'firebase-app-hosting') {
    // Firebase App Hosting sets this header at its edge. The underlying Cloud Run
    // service must require an authenticated invoker so requests cannot bypass it.
    const address = req.headers.get('x-fah-client-ip')?.trim() ?? '';
    const family = isIP(address);
    const secret = process.env.PROMOTION_NETWORK_HASH_SECRET;
    if (!family || address.includes('%') || !secret || secret.length < 24) {
      throw new Error('Promotion network validation is unavailable.');
    }
    const canonical = family === 6 ? new URL(`http://[${address}]`).hostname : address;
    const network = createHmac('sha256', secret)
      .update(`offer-network:${Math.floor(now / 86_400_000)}:${canonical}`).digest('hex');
    buckets.push({ id: `network_${network}`, limit: NETWORK_LIMIT });
  } else if (process.env.K_SERVICE || process.env.PROMOTION_NETWORK_SOURCE) {
    throw new Error('Promotion network validation is unconfigured.');
  }
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
