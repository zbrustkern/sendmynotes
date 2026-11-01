import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cleanupAccountLibrary } from '@/lib/account/images';
import { cleanupExpiredAccountDrafts } from '@/lib/account/drafts';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function authorized(req: NextRequest) {
  const secret = process.env.UPLOAD_CLEANUP_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === 'production') return false;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided); const b = Buffer.from(secret);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Cleanup authorization is required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const [images, drafts] = await Promise.all([cleanupAccountLibrary(), cleanupExpiredAccountDrafts()]);
  return NextResponse.json({ cleanup: { images, drafts } }, { headers: { 'Cache-Control': 'no-store' } });
}
