'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { AddressDraft } from '@/lib/draft/types';
import type { AccountContact, AccountList } from '@/lib/account/contracts';
import { accountFetch } from '@/lib/account/client';
import { normalizeCountryCode, validateMailingAddress } from '@/lib/mailing-destinations';

type Props = {
  user: User | null;
  currentRecipient: AddressDraft | null;
  onChoose: (recipient: AddressDraft, contact: AccountContact) => void;
  disabled?: boolean;
};
const button = 'min-h-11 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-emerald-950 disabled:opacity-50';
function toDraft(contact: AccountContact): AddressDraft | null {
  const address = contact.address;
  if (!address || !validateMailingAddress(address).valid) return null;
  return {
    name: [address.firstName, address.lastName].filter(Boolean).join(' ') || contact.displayName,
    addressLine1: address.street1,
    ...(address.street2 ? { addressLine2: address.street2 } : {}),
    city: address.city, state: address.state, zip: address.zip, country: normalizeCountryCode(address.country || 'US') || 'US',
  };
}
function hasRecipient(value: AddressDraft | null): boolean {
  return Boolean(value && Object.entries(value).some(([key,item]) => key !== 'country' && typeof item === 'string' && item.trim()));
}

/** A contextual, owner-scoped picker; choosing a saved address always requires an explicit action. */
export function AccountRecipientPicker({ user, currentRecipient, onChoose, disabled = false }: Props) {
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<AccountContact | null>(null);
  const [open, setOpen] = useState(false);
  const [dataUid, setDataUid] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const focusedOpen = useRef(false);
  const currentUid = useRef(user?.uid || ''); currentUid.current = user?.uid || '';
  const visibleOpen = open;
  useEffect(() => {
    setContacts([]); setNext(null); setError(''); setPending(null); setDataUid(''); setOpen(false);
  }, [user?.uid]);
  useEffect(() => {
    if (!open || !user) return;
    let live = true;
    if (dataUid === user.uid && contacts.length) { contentRef.current?.querySelector<HTMLElement>('button:not([disabled]),a[href]')?.focus(); return; }
    const actor = user; setBusy(true); setError('');
    void accountFetch<AccountList<AccountContact>>(actor, '/api/account/people').then(page => {
      if (live && currentUid.current === actor.uid) { setContacts(page.data); setNext(page.nextCursor); setDataUid(actor.uid); }
    }).catch(reason => { if (live && currentUid.current === actor.uid) setError(reason instanceof Error ? reason.message : 'Your address book could not be loaded.'); })
      .finally(() => { if (live && currentUid.current === actor.uid) setBusy(false); });
    return () => { live = false; };
  }, [open,user?.uid]);
  useEffect(() => {
    if(!open){focusedOpen.current=false;return;}
    if(!focusedOpen.current){contentRef.current?.querySelector<HTMLElement>('button:not([disabled]),a[href]')?.focus();focusedOpen.current=true;}
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setOpen(false);setPending(null);triggerRef.current?.focus();}};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[open]);
  if (!user) return null;
  const visibleContacts = dataUid === user.uid ? contacts : [];
  const pendingForCurrent = dataUid === user.uid ? pending : null;
  const close = () => { setOpen(false); setPending(null); triggerRef.current?.focus(); };
  const loadMore = async () => {
    const actor = user; const cursor = next; if (!actor || dataUid!==actor.uid || !cursor) return;
    setBusy(true); setError('');
    try {
      const page = await accountFetch<AccountList<AccountContact>>(actor, `/api/account/people?cursor=${encodeURIComponent(cursor)}`);
      if (currentUid.current === actor.uid) { setContacts(rows => [...rows, ...page.data]); setNext(page.nextCursor); setDataUid(actor.uid); }
    } catch (reason) { if (currentUid.current === actor.uid) setError(reason instanceof Error ? reason.message : 'More people could not be loaded.'); }
    finally { if (currentUid.current === actor.uid) setBusy(false); }
  };
  const choose = (contact: AccountContact) => {
    const recipient = toDraft(contact);
    if (!recipient) { setError('Add a complete mailing address to this person before using it on a card.'); return; }
    setError(''); setPending(null); setOpen(false); onChoose(recipient, contact); triggerRef.current?.focus();
  };
  const openPicker = () => { setOpen(true); };
  const loadingCurrent = busy || (open && dataUid!==user.uid);
  return <section className="w-full" aria-label="Choose a saved recipient">
    <button ref={triggerRef} type="button" className={`${button} w-full`} aria-expanded={visibleOpen} onClick={() => open ? close() : openPicker()}>Choose from address book</button>
    {visibleOpen&&<div ref={contentRef} className="mt-3 rounded-xl border border-stone-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-serif text-lg text-stone-900">Your address book</h3><p className="text-sm text-stone-600">Review their mailing address before you continue.</p></div><div className="flex items-center gap-3"><Link href="/account/people" className="text-sm text-emerald-900 underline">Manage people</Link><button type="button" className={button} onClick={close}>Close</button></div></div>
    {loadingCurrent && !visibleContacts.length && <p className="mt-3 text-sm text-stone-500" role="status">Loading people…</p>}
    {!loadingCurrent && !visibleContacts.length && !error && <p className="mt-3 text-sm text-stone-600">No people saved yet. Add someone in your account to use this shortcut.</p>}
    {!!visibleContacts.length && <ul className="mt-3 divide-y divide-stone-100">{visibleContacts.map(contact => {
      const address = contact.address;
      const ready = Boolean(toDraft(contact));
      const label = address ? [address.street1, address.city, address.state, address.zip].filter(Boolean).join(', ') : 'No mailing address saved';
      return <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><span className="min-w-0"><strong className="block truncate text-sm">{contact.displayName}</strong><small className="block truncate text-stone-500">{label}</small>{!ready&&<Link className="text-xs text-emerald-900 underline" href={`/account/people/${encodeURIComponent(contact.id)}`}>Complete address</Link>}</span><button type="button" className={button} disabled={disabled || loadingCurrent || !ready} onClick={() => hasRecipient(currentRecipient) ? setPending(contact) : choose(contact)}>Use this address</button></li>;
    })}</ul>}
    {pendingForCurrent && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" role="alert"><p className="text-sm text-stone-800">Replace the recipient address you have entered with <strong>{pendingForCurrent.displayName}</strong>’s saved address?</p><div className="mt-2 flex gap-2"><button type="button" className="min-h-11 rounded-lg bg-emerald-900 px-4 text-sm text-white" disabled={disabled} onClick={() => choose(pendingForCurrent)}>Replace address</button><button type="button" className={button} onClick={() => setPending(null)}>Keep current</button></div></div>}
    {dataUid===user.uid&&next && <button type="button" className={`${button} mt-3`} disabled={busy || disabled} onClick={() => void loadMore()}>{busy ? 'Loading…' : 'Load more people'}</button>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}
    </div>}
  </section>;
}
