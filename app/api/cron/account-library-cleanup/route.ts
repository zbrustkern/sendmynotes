import { NextRequest, NextResponse } from 'next/server';
import { cleanupAccountLibrary, previewAccountLibraryCleanup } from '@/lib/account/images';
import { cleanupExpiredAccountDrafts, previewExpiredAccountDrafts } from '@/lib/account/drafts';
import { cronAuthorized } from '@/lib/cron-auth';
import { beginOperationalRun, finishOperationalRun } from '@/lib/operational-runs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req, 'UPLOAD_CLEANUP_SECRET')) return NextResponse.json({ error: 'Cleanup authorization is required.' }, { status: 401, headers });
  if (req.nextUrl.searchParams.get('dryRun') === 'true') {
    try {
      const [images, drafts] = await Promise.all([previewAccountLibraryCleanup(Date.now(), 100), previewExpiredAccountDrafts(Date.now(), 100)]);
      return NextResponse.json({ data: { state: 'dry_run', preview: { ...images, ...drafts } } }, { headers });
    } catch { return NextResponse.json({ error: 'Account cleanup preview is unavailable.', code: 'preview_failed' }, { status: 503, headers }); }
  }
  const run = await beginOperationalRun('account-library-cleanup');
  if (!run.acquired) return NextResponse.json({ data: { state: 'already_running_or_complete' } }, { status: 202, headers });
  try {
    // Both service methods cap a pass at 100 records. The persisted run slot
    // prevents overlapping invocations; the next daily pass continues safely.
    const [images, drafts] = await Promise.all([cleanupAccountLibrary(Date.now(), 100), cleanupExpiredAccountDrafts(Date.now(), 100)]);
    const summary = { deletedImages: images.deleted, pendingImages: images.pending, expiredDrafts: drafts };
    await finishOperationalRun(run.id, run.attemptToken!, 'succeeded', summary);
    return NextResponse.json({ data: { state: 'succeeded', summary } }, { headers });
  } catch {
    if (run.attemptToken) await finishOperationalRun(run.id, run.attemptToken, 'failed', { failed: true });
    return NextResponse.json({ error: 'Account cleanup needs operator attention.', code: 'cleanup_failed' }, { status: 503, headers });
  }
}
