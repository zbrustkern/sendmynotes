import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

export function cronAuthorized(req: NextRequest, secretName: 'UPLOAD_CLEANUP_SECRET' | 'REMINDER_WORKER_SECRET' | 'MULTI_SEND_WORKER_SECRET'): boolean {
  const secret = process.env[secretName]?.trim();
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  const provided = header.replace(/^Bearer\s+/i, '').trim();
  const actual = Buffer.from(provided);
  const expected = Buffer.from(secret);
  return actual.length > 0 && actual.length === expected.length && timingSafeEqual(actual, expected);
}
