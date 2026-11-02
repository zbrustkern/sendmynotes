import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAdminActor, isAuthorizedAdminEmail, verifyAdminAuth } from '@/lib/admin-auth';
import { listPrivacyRequestsForAdmin } from '@/lib/account/privacy-requests';
import { getOperationalRunHealth } from '@/lib/operational-runs';
import { isSameOrigin } from '@/lib/upload/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie' };

export async function GET(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  try {
    const cursor = req.nextUrl.searchParams.get('cursor') || undefined;
    const [requests, operations, reminderQueue] = await Promise.all([listPrivacyRequestsForAdmin(100, cursor), getOperationalRunHealth(), (await import('@/lib/reminders-v2/engine')).getReminderQueueDiagnostics()]);
    return NextResponse.json({ data: { requests: requests.data, nextCursor: requests.nextCursor, operations, reminderQueue } }, { headers });
  } catch {
    return NextResponse.json({ error: 'Operational queue is unavailable.' }, { status: 503, headers });
  }
}

export async function PATCH(req: NextRequest) {
  if (!verifyAdminAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Request origin is not allowed.' }, { status: 403, headers });
  const operator = getAuthenticatedAdminActor(req);
  if (!operator || !isAuthorizedAdminEmail(operator)) return NextResponse.json({ error: 'Authorized operator identity is required.' }, { status: 403, headers });
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || typeof body.id !== 'string') return NextResponse.json({ error: 'Invalid request update.' }, { status: 400, headers });
    if (body.assignedTo !== undefined && body.assignedTo !== null && (typeof body.assignedTo !== 'string' || !isAuthorizedAdminEmail(body.assignedTo))) return NextResponse.json({ error: 'Assignment must use an authorized operator account.' }, { status: 400, headers });
    const { updatePrivacyRequest } = await import('@/lib/account/privacy-requests');
    const request = await updatePrivacyRequest({ id: body.id, expectedVersion: body.expectedVersion, status: body.status, assignedTo: body.assignedTo, operator, confirmCompletion: body.confirmCompletion, evidenceRef: body.evidenceRef });
    return NextResponse.json({ data: request }, { headers });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status: unknown }).status) : 503;
    const message = error instanceof Error ? error.message : 'Request update could not be saved.';
    return NextResponse.json({ error: message, code: error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : 'unavailable' }, { status: status >= 400 && status <= 599 ? status : 503, headers });
  }
}
