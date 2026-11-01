'use client';
import Link from 'next/link';
import type { useBuilderAccount } from '@/lib/account/use-builder-account';

type Tools = ReturnType<typeof useBuilderAccount>;
export function AccountBuilderTools({ tools, signedIn, disabled, addressStep }: { tools:Tools;signedIn:boolean;disabled:boolean;addressStep:boolean }) {
  const button='min-h-11 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-emerald-950 disabled:opacity-50';
  if (!signedIn && !tools.error) return null;
  return <section className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6" aria-label="Account card tools">
    {signedIn && <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={disabled||tools.busy} onClick={()=>void tools.saveDraft()}>Save draft to account</button>
      <Link className={button} href="/account/images">Saved images</Link>
      {addressStep && <button type="button" className={button} disabled={disabled||tools.busy} onClick={()=>void tools.saveRecipient()}>Save this person</button>}
      <span className="text-xs text-stone-500">Account drafts are kept for 90 days of inactivity.</span>
    </div>}
    {tools.pending && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4" role="region" aria-label="Review saved item">
      <h2 className="font-serif text-xl text-emerald-950">{tools.pending.draft?'Open this saved draft?':`Use ${tools.pending.contact?.displayName} for this card?`}</h2>
      <p className="mt-2 text-sm text-stone-700">{tools.pending.draft?'This replaces the card currently on this device. Save the current draft first if you want to keep both. Payment and scheduling details will be reset.':'Your note and front stay the same. Review the current mailing address before checkout.'}</p>
      <div className="mt-3 flex flex-wrap gap-2"><button className={button} disabled={disabled} onClick={tools.applyPending}>{tools.pending.draft?'Open saved draft':'Use this person'}</button><button className={button} onClick={tools.cancelPending}>Keep current card</button></div>
    </div>}
    {tools.error&&<p role="alert" className="mt-3 text-sm text-rose-800">{tools.error}</p>}
    {tools.conflict&&<button className={`${button} mt-2`} disabled={tools.busy} onClick={()=>void tools.saveDraft(true)}>Save my changes as a separate draft</button>}
    {tools.status&&<p role="status" aria-live="polite" className="mt-2 text-sm text-emerald-900">{tools.status}</p>}
  </section>;
}
