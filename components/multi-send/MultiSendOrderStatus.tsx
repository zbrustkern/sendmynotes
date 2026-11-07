import Link from 'next/link';
import type { Order } from '@/lib/types';
import type { MultiSendView } from '@/lib/multi-send/presentation';

export function MultiSendOrderStatus({order,view}:{order:Order;view:MultiSendView}) {
 const pending=order.status==='PENDING_PAYMENT';
 const paid=['PAYMENT_RECEIVED','QUEUED_FOR_FULFILLMENT','DISPATCHING','DISPATCH_UNCERTAIN','PROCESSING_HANDWRYTTEN','MAILED'].includes(order.status);
 const total=order.finalAmountInCents??order.amountInCents??0;
 return <main className="min-h-screen bg-[#FAF8F5] px-5 py-10 text-stone-900"><div className="max-w-2xl mx-auto space-y-6">
  <Link href="/" className="text-emerald-800 underline">SendMyNotes</Link>
  <p className="text-sm text-stone-500">Order {order.id}</p>
  <h1 className="font-serif text-3xl">{view.redacted?'Your order details are private':pending?'Your cards are awaiting payment':`${view.quantity} cards, one thoughtful gesture.`}</h1>
  {view.redacted?<p>Open the secure link from your checkout or receipt, or view this order from your account. A recipient’s ZIP code cannot unlock the other cards.</p>:<>
   <p>{paid?'Payment received':'Order total'} · ${(total/100).toFixed(2)} USD</p>
   <p className="text-sm text-stone-600">Each card is prepared and mailed separately. A card marked “Checking” does not need another payment or send request.</p>
   {view.deliveries.map(delivery=><section key={delivery.id} className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
    <h2 className="font-semibold">{delivery.name}</h2><p className="text-sm text-stone-600">{delivery.address.street1}{delivery.address.street2?`, ${delivery.address.street2}`:''}<br/>{delivery.address.city}, {delivery.address.state} {delivery.address.zip}</p>
    <p className="font-medium text-emerald-900">{delivery.status}</p>
    <p className="text-sm">Inside greeting: {delivery.greeting||'No greeting'}</p>
    <details><summary className="cursor-pointer py-2 text-emerald-800">Read this card</summary><p className="whitespace-pre-wrap break-words text-sm">{delivery.message}</p></details>
    {delivery.needsSupport&&<p className="text-sm">This card was not sent. <a className="underline text-emerald-800" href={`mailto:support@sendmynotes.com?subject=${encodeURIComponent(`Order ${order.id} — recipient ${delivery.id}`)}`}>Contact support</a> to correct its address or request a refund for this card.</p>}
   </section>)}
  </>}
  <Link href="/account/history" className="inline-block text-emerald-800 underline">Card history</Link>
 </div></main>;
}
