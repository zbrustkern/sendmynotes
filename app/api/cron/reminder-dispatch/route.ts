import { NextRequest, NextResponse } from 'next/server';
import { dispatchDueReminders, getReminderQueueDiagnostics } from '@/lib/reminders-v2/engine';
import { cronAuthorized } from '@/lib/cron-auth';
import { beginOperationalRun, finishOperationalRun } from '@/lib/operational-runs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req, 'REMINDER_WORKER_SECRET')) return NextResponse.json({ error: 'Reminder worker authorization is required.', code: 'unauthorized' }, { status: 401, headers });
  const run = await beginOperationalRun('reminder-dispatch');
  if (!run.acquired) return NextResponse.json({ data: { state: 'already_running_or_complete' } }, { status: 202, headers });
  if (process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE !== 'true') {
    try {
      const queue = await getReminderQueueDiagnostics();
      const summary = { considered: 0, accepted: 0, cancelled: 0, skipped: 0, uncertain: queue.uncertainCount, ...queue, backlogMeasured: true, deliveryDisabled: true };
      await finishOperationalRun(run.id, run.attemptToken!, 'disabled', summary);
      return NextResponse.json({ data: { state: 'disabled', summary } }, { headers });
    } catch {
      if (run.attemptToken) await finishOperationalRun(run.id, run.attemptToken, 'failed', { failed: true });
      return NextResponse.json({ error: 'Reminder queue status needs operator attention.', code: 'queue_unavailable' }, { status: 503, headers });
    }
  }
  try {
    const dispatch = await dispatchDueReminders();
    const queue = await getReminderQueueDiagnostics();
    const summary = { ...dispatch, ...queue, backlogMeasured: true };
    await finishOperationalRun(run.id, run.attemptToken!, 'succeeded', summary);
    return NextResponse.json({ data: { state: 'succeeded', summary } }, { headers });
  } catch {
    if (run.attemptToken) await finishOperationalRun(run.id, run.attemptToken, 'failed', { failed: true });
    return NextResponse.json({ error: 'Reminder dispatch needs operator attention.', code: 'dispatch_failed' }, { status: 503, headers });
  }
}
