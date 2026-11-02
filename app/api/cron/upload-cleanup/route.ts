import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredUploads, previewExpiredUploads, assertUploadRuntime, uploadErrorResponse } from '@/lib/upload/access';
import { UploadError } from '@/lib/upload/contracts';
import { cronAuthorized } from '@/lib/cron-auth';
import { beginOperationalRun, finishOperationalRun } from '@/lib/operational-runs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req, 'UPLOAD_CLEANUP_SECRET')) return NextResponse.json({ error: 'Cleanup authorization is required.' }, { status: 401, headers });
  let run: Awaited<ReturnType<typeof beginOperationalRun>> | undefined;
  try {
    assertUploadRuntime();
    if (req.nextUrl.searchParams.get('dryRun') === 'true') return NextResponse.json({ data: { state: 'dry_run', preview: await previewExpiredUploads(Date.now(), 100) } }, { headers });
    run = await beginOperationalRun('upload-cleanup');
    if (!run.acquired) return NextResponse.json({ data: { state: 'already_running_or_complete' } }, { status: 202, headers });
    const summary = await cleanupExpiredUploads();
    await finishOperationalRun(run.id, run.attemptToken!, 'succeeded', summary);
    return NextResponse.json({ data: { state: 'succeeded', summary } }, { headers });
  } catch (error) {
    if (run?.acquired && run.attemptToken) await finishOperationalRun(run.id, run.attemptToken, 'failed', { failed: true });
    if (error instanceof UploadError) { const response = await uploadErrorResponse(error); response.headers.set('Cache-Control', 'private, no-store, max-age=0'); return response; }
    return NextResponse.json({ error: 'Cleanup needs operator attention.', code: 'cleanup_failed' }, { status: 503, headers });
  }
}
