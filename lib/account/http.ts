import * as admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { firestoreDb, isFirestoreMock, verifyFirebaseIdToken } from '@/lib/firebase-admin';
import { isSameOrigin } from '@/lib/upload/http';
import type { AccountActor } from './contracts';

export class AccountError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = 'AccountError'; }
}
export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization' };
export function accountJson<T>(data: T, status = 200) { return NextResponse.json({ data }, { status, headers: PRIVATE_HEADERS }); }
export function accountError(error: unknown) {
  if (error instanceof AccountError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: PRIVATE_HEADERS });
  if (error instanceof Error && 'status' in error && 'code' in error) {
    const e = error as Error & { status: number; code: string };
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: PRIVATE_HEADERS });
  }
  return NextResponse.json({ error: 'Your account could not be updated. Please try again.', code: 'unavailable' }, { status: 503, headers: PRIVATE_HEADERS });
}
export async function requireAccountActor(req: NextRequest, write = false): Promise<AccountActor> {
  if (process.env.NODE_ENV === 'production' && isFirestoreMock) throw new AccountError('unavailable', 'Account storage is not configured.', 503);
  if (write && !isSameOrigin(req)) throw new AccountError('origin_forbidden', 'Request origin is not allowed.', 403);
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  let decoded = null;
  if (token && !isFirestoreMock && admin.apps.length) {
    try { decoded = await admin.auth().verifyIdToken(token, true); } catch { /* reject below */ }
  } else decoded = await verifyFirebaseIdToken(token);
  if (!decoded) throw new AccountError('unauthorized', 'Sign in to open your account.', 401);
  return { uid: decoded.uid, email: decoded.email?.trim().toLowerCase() || '', emailVerified: decoded.email_verified === true };
}
export function validAccountId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new AccountError('invalid_id', 'Invalid account item.');
  return value;
}
export function accountScope(uid: string): string {
  return createHash('sha256').update(`${process.env.LOB_ENV || process.env.NODE_ENV || 'development'}:${uid}`).digest('hex');
}
export function accountCollection(kind: string) {
  if (!/^[a-z_]+$/.test(kind)) throw new Error('Invalid account collection');
  return firestoreDb.collection(`account_${kind}`);
}
export function accountDoc(kind: string, uid: string, id: string) { return accountCollection(kind).doc(`${accountScope(uid)}_${validAccountId(id)}`); }
export async function readAccountBody(req: NextRequest): Promise<Record<string, unknown>> {
  if (Number(req.headers.get('content-length')) > 100_000) throw new AccountError('too_large', 'This save is too large.', 413);
  const text = await req.text();
  if (text.length > 100_000) throw new AccountError('too_large', 'This save is too large.', 413);
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new AccountError('invalid', 'Please check the submitted fields.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AccountError('invalid', 'Please check the submitted fields.');
  return data as Record<string, unknown>;
}
export function expectedVersion(input: unknown): number {
  if (!Number.isSafeInteger(input) || Number(input) < 1) throw new AccountError('invalid_version', 'Reload this item before saving.');
  return Number(input);
}
