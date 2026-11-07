'use client';
import { useEffect, useState, useCallback } from 'react';
import type { MailingAddress } from '@/lib/types';
import type { MultiSendView } from '@/lib/multi-send/presentation';
import { deliveryStatus } from '@/lib/multi-send/presentation';

type Row = { id: string; number: number; state: string; stateVersion: number; amountInCents: number; hasSupplierId: boolean; hasRefundId: boolean };
type Action = { row: Row; type: 'refund' | 'correct-delivery'; key: string; reason: string; address?: MailingAddress; consent: boolean };

export function MultiSendDeliveryPanel({ orderId, revealed }: { orderId: string; revealed?: MultiSendView }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [held, setHeld] = useState(false);
  const [resume, setResume] = useState<{ key: string; reason: string }>();
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action>();
  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/multi-send/deliveries?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load deliveries.');
    setRows(data.deliveries); setHeld(data.held === true);
  }, [orderId]);
  useEffect(() => { setRows([]); setAction(undefined); load().catch(e => setError(e.message)); }, [load]);
  async function run(endpoint: string, body: Record<string, unknown>) {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/multi-send/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, ...body }) });
      const data = await response.json();
      if (!response.ok || data.success === false) throw new Error(data.error || 'Action needs operator attention.');
      setAction(undefined); setResume(undefined); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); await load().catch(() => {}); }
    finally { setBusy(false); }
  }
  return <section aria-label="Multi-send deliveries" className="rounded-xl border border-stone-300 p-4 space-y-3">
    <h3 className="font-semibold">Individual card deliveries</h3>
    <p className="text-sm text-stone-600">One payment. Each card has its own delivery status. Reveal PII with an operational reason to inspect purchased messages and addresses.</p>
    {held && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm"><p>Pending cards are held. Resolve the payment, environment or operational-control issue before resuming. Accepted and uncertain cards will not be reset.</p><button className="underline mt-2" disabled={busy} onClick={() => setResume({ key: crypto.randomUUID(), reason: '' })}>Resume pending cards</button></div>}
    {resume && <form onSubmit={e => { e.preventDefault(); run('resume', { idempotencyKey: resume.key, reason: resume.reason }); }} className="space-y-2"><label className="block">Reason for resuming<textarea className="block border rounded w-full p-2" required minLength={5} maxLength={500} value={resume.reason} onChange={e => setResume({...resume, reason:e.target.value})} /></label><button disabled={busy} className="underline">Confirm resume of pending cards</button> <button type="button" disabled={busy} onClick={()=>setResume(undefined)}>Cancel</button></form>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {rows.map(row => {
      const content = revealed?.deliveries.find(item => item.id === row.id);
      return <div key={row.id} className="rounded-lg border p-3 space-y-2 text-sm">
        <p className="font-semibold">{content?.name || `Recipient ${row.number}`} · {row.state === 'AWAITING_MANIFEST' ? 'Awaiting preparation' : deliveryStatus(row.state).label}</p>
        <p>Allocated payment: ${(row.amountInCents / 100).toFixed(2)}</p>
        {content && <details><summary>Purchased message and delivery address</summary><p className="whitespace-pre-wrap my-2">{content.message}</p><p>{content.address.street1} {content.address.street2}, {content.address.city}, {content.address.state} {content.address.zip}</p></details>}
        {(row.state === 'DISPATCH_UNCERTAIN' || row.state === 'DISPATCHING') && <p>Do not resend or correct this card while its outcome is being checked.</p>}
        <div className="flex gap-3 flex-wrap">
          {row.hasSupplierId && ['ACCEPTED', 'MAILED', 'DISPATCH_UNCERTAIN', 'DISPATCHING'].includes(row.state) && <button disabled={busy} className="underline" onClick={() => run('sync-delivery', { recipientId: row.id })}>Check supplier status</button>}
          {row.state === 'REFUND_PENDING' && <button disabled={busy} className="underline" onClick={() => run('reconcile-refund', { recipientId: row.id })}>Check refund status</button>}
          {row.state === 'REJECTED' && <>
            <button disabled={busy} className="underline" onClick={() => setAction({ row, type: 'refund', key: crypto.randomUUID(), reason: '', consent: false })}>Refund this card</button>
            {content && <button disabled={busy} className="underline" onClick={() => setAction({ row, type: 'correct-delivery', key: crypto.randomUUID(), reason: '', consent: false, address: { ...content.address } })}>Correct this address</button>}
          </>}
        </div>
      </div>;
    })}
    {action && <form className="border border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3" onSubmit={e => { e.preventDefault(); run(action.type, { recipientId: action.row.id, expectedStateVersion: action.row.stateVersion, idempotencyKey: action.key, reason: action.reason, ...(action.address ? { address: action.address, confirmBillableDispatch: action.consent } : {}) }); }}>
      <h4 className="font-semibold">{action.type === 'refund' ? `Refund $${(action.row.amountInCents / 100).toFixed(2)}` : 'Correct and queue this card'} · recipient {action.row.number}</h4>
      {action.address && <div className="grid sm:grid-cols-2 gap-2">{(['firstName', 'lastName', 'street1', 'street2', 'city', 'state', 'zip'] as const).map(field => <label key={field} className="block text-sm">{({firstName:'First name',lastName:'Last name',street1:'Street address',street2:'Unit',city:'City',state:'State',zip:'ZIP code'})[field]}<input required={!['lastName', 'street2'].includes(field)} className="block w-full border rounded p-2" value={action.address?.[field] || ''} onChange={e => setAction({ ...action, address: { ...action.address!, [field]: e.target.value } })} /></label>)}</div>}
      <label className="block text-sm">Operational reason<textarea required minLength={5} maxLength={500} className="block border rounded p-2 w-full" value={action.reason} onChange={e => setAction({ ...action, reason: e.target.value })} /></label>
      {action.type === 'correct-delivery' && <label className="block text-sm"><input type="checkbox" required checked={action.consent} onChange={e => setAction({ ...action, consent: e.target.checked })} /> I authorize a billable supplier submission for this known-rejected card only.</label>}
      <div className="flex gap-4"><button disabled={busy} className="bg-stone-900 text-white rounded px-4 py-2">{busy ? 'Working…' : action.type === 'refund' ? 'Confirm card refund' : 'Save correction and queue card'}</button><button type="button" disabled={busy} onClick={() => setAction(undefined)}>Cancel</button></div>
    </form>}
  </section>;
}
