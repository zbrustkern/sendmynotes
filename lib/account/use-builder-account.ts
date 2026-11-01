'use client';
import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { AccountContact, AccountDraft, AccountDraftContent, AccountImage, AccountImageSelection, AccountOccasion, AccountPreferences } from './contracts';
import { accountFetch, AccountClientError } from './client';

type Options = {
  user: User | null; loaded: boolean; authLoading: boolean; disabled: boolean;
  content: AccountDraftContent; ownerUid?: string | null;
  draftId: string; contactId: string; occasionId: string;
  onDraft: (draft: AccountDraft) => void;
  onContact: (contact: AccountContact, occasion?: AccountOccasion) => void;
  onPrivateInvalidated: () => void;
  onDefaultReturn: (preferences: AccountPreferences) => void;
};
type Pending = { uid: string; draft?: AccountDraft; contact?: AccountContact; occasion?: AccountOccasion };
function removeHandoffQuery() {
  const url = new URL(window.location.href);
  for (const key of ['accountDraft', 'accountContact', 'accountOccasion']) url.searchParams.delete(key);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function useBuilderAccount(options: Options) {
  const latest = useRef(options); latest.current = options;
  const [pending, setPending] = useState<Pending | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<AccountContact[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preview, setPreview] = useState<{ uid: string; id: string; hash: string; url: string; title: string } | null>(null);
  const saved = useRef<{ uid: string; id: string; version: number; title: string } | null>(null);
  const saveKey = useRef('');
  const completedQuery = useRef('');
  const previousUid = useRef(options.user?.uid);
  const uid = options.user?.uid || '';
  const selected = options.content.accountImage;

  useEffect(() => {
    if (options.authLoading) return;
    if (previousUid.current && previousUid.current !== uid) {
      setPending(null); setContacts([]); setCursor(null); setPickerOpen(false); setStatus(''); setError(''); setBusy(false); setConflict(false); setPreview(null);
      saved.current = null; saveKey.current = ''; completedQuery.current = ''; removeHandoffQuery();
      latest.current.onPrivateInvalidated();
    }
    previousUid.current = uid;
  }, [uid, options.authLoading]);

  useEffect(() => {
    if (!options.loaded || options.authLoading || !options.user) return;
    const user = options.user; let active = true;
    void accountFetch<{data:AccountPreferences}>(user, '/api/account/preferences').then(({data}) => {
      if (active && latest.current.user?.uid === user.uid) latest.current.onDefaultReturn(data);
    }).catch(() => { /* Optional prefill must not block guest/card work. */ });
    return () => { active = false; };
  }, [uid, options.loaded, options.authLoading]);

  useEffect(() => {
    if (!options.loaded || options.authLoading) return;
    const key = `${options.draftId}:${options.contactId}:${options.occasionId}`;
    if ((!options.draftId && !options.contactId) || completedQuery.current === key) return;
    if (!options.user) { setError('Sign in from the menu to open the item saved in your account. Your current card is still here.'); return; }
    const user = options.user; let active = true;
    setError(''); setBusy(true);
    void (async () => {
      let next: Pending;
      if (options.draftId) {
        const response = await accountFetch<{data:AccountDraft}>(user, `/api/account/drafts/${encodeURIComponent(options.draftId)}`);
        next = { uid: user.uid, draft: response.data };
      } else {
        const [{data:contact}, occasionResponse] = await Promise.all([
          accountFetch<{data:AccountContact}>(user, `/api/account/people/${encodeURIComponent(options.contactId)}`),
          options.occasionId ? accountFetch<{data:AccountOccasion}>(user, `/api/account/occasions/${encodeURIComponent(options.occasionId)}`) : Promise.resolve(null),
        ]);
        if (occasionResponse && occasionResponse.data.contactId !== contact.id) throw new Error('This occasion belongs to a different person.');
        next = { uid: user.uid, contact, occasion: occasionResponse?.data };
      }
      if (active && latest.current.user?.uid === user.uid) { setPending(next); completedQuery.current = key; }
    })().catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not open the saved item.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [uid, options.loaded, options.authLoading, options.draftId, options.contactId, options.occasionId]);

  useEffect(() => {
    setPreview(null);
    if (!selected || !options.loaded || options.authLoading) return;
    const user = options.user;
    if (!user || options.ownerUid !== user.uid) {
      if (!options.authLoading) latest.current.onPrivateInvalidated();
      return;
    }
    let active = true, url = '';
    void (async () => {
      const {data} = await accountFetch<{data:{image:AccountImage;selection:AccountImageSelection}}>(user, `/api/account/images/${encodeURIComponent(selected.imageId)}/resolve`);
      if (data.selection.version < selected.version || data.selection.masterSha256 !== selected.masterSha256) throw new Error('This saved front changed. Open it again from Saved images.');
      const token = await user.getIdToken();
      const response = await fetch(`/api/account/images/${encodeURIComponent(selected.imageId)}/media`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) throw new Error('Your saved front could not be opened. Choose it again or use another front.');
      url = URL.createObjectURL(await response.blob());
      if (!active || latest.current.user?.uid !== user.uid) { URL.revokeObjectURL(url); return; }
      setPreview({ uid: user.uid, id: selected.imageId, hash: selected.masterSha256, url, title: data.image.title });
    })().catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not verify this saved front.'); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [uid, options.loaded, options.authLoading, options.ownerUid, selected?.imageId, selected?.version, selected?.masterSha256]);

  const applyPending = () => {
    if (!pending || latest.current.disabled || pending.uid !== latest.current.user?.uid) return;
    if (pending.draft) {
      latest.current.onDraft(pending.draft);
      saved.current = { uid: pending.uid, id: pending.draft.id, version: pending.draft.version, title: pending.draft.title };
    } else if (pending.contact) latest.current.onContact(pending.contact, pending.occasion);
    setPending(null); setError(''); removeHandoffQuery();
  };
  const cancelPending = () => { setPending(null); setError(''); removeHandoffQuery(); };
  const saveDraft = async (copy = false) => {
    const current = latest.current; const user = current.user;
    if (!user || current.disabled || busy) return;
    setBusy(true); setError(''); setStatus('Saving…');
    const existing = !copy && saved.current?.uid === user.uid ? saved.current : null;
    if (!saveKey.current || copy) saveKey.current = crypto.randomUUID();
    const title = existing?.title || (current.content.recipient?.name ? `A card for ${current.content.recipient.name}` : 'A thought in progress');
    try {
      const {data} = await accountFetch<{data:AccountDraft}>(user, existing ? `/api/account/drafts/${existing.id}` : '/api/account/drafts', {
        method: existing ? 'PATCH' : 'POST', headers: { 'Idempotency-Key': saveKey.current },
        body: JSON.stringify({ title, content: current.content, ...(existing ? { expectedVersion: existing.version } : {}) }),
      });
      if (latest.current.user?.uid !== user.uid) return;
      saved.current = { uid: user.uid, id: data.id, version: data.version, title: data.title };
      saveKey.current = ''; setStatus('Saved to your account. Kept for 90 days of inactivity.'); setConflict(false);
    } catch (e) {
      if (latest.current.user?.uid !== user.uid) return;
      setStatus(''); setConflict(e instanceof AccountClientError && e.status === 409);
      setError(e instanceof Error ? e.message : 'Could not save. Your current card is still here.');
    } finally { if(latest.current.user?.uid===user.uid)setBusy(false); }
  };
  const loadContacts = async (more = false) => {
    const user = latest.current.user; if (!user || busy) return;
    setPickerOpen(true); setBusy(true); setError('');
    try {
      const data = await accountFetch<{data:AccountContact[];nextCursor:string|null}>(user, `/api/account/people${more && cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      if (latest.current.user?.uid !== user.uid) return;
      setContacts(old => more ? [...old, ...data.data] : data.data); setCursor(data.nextCursor);
    } catch (e) { if (latest.current.user?.uid === user.uid) setError(e instanceof Error ? e.message : 'Could not load your address book.'); }
    finally { if(latest.current.user?.uid===user.uid)setBusy(false); }
  };
  const chooseContact = (contact: AccountContact) => { if (!latest.current.disabled) { latest.current.onContact(contact); setPickerOpen(false); } };
  const saveRecipient = async () => {
    const user = latest.current.user, address = latest.current.content.recipient;
    if (!user || !address?.name.trim() || busy) return;
    setBusy(true); setError('');
    const [firstName, ...last] = address.name.trim().split(/\s+/);
    try {
      await accountFetch(user, '/api/account/people', { method: 'POST', headers: {'Idempotency-Key':crypto.randomUUID()}, body: JSON.stringify({displayName:address.name,relationship:'',notes:'',address:{firstName,lastName:last.join(' '),street1:address.addressLine1,street2:address.addressLine2||'',city:address.city,state:address.state,zip:address.zip,country:address.country||'US'}}) });
      if (latest.current.user?.uid === user.uid) setStatus('Person saved to your address book.');
    } catch (e) { if (latest.current.user?.uid === user.uid) setError(e instanceof Error ? e.message : 'Could not save this person.'); }
    finally { if(latest.current.user?.uid===user.uid)setBusy(false); }
  };
  const ready = Boolean(selected && preview && preview.uid === uid && preview.id === selected.imageId && preview.hash === selected.masterSha256 && options.ownerUid === uid);
  return { pending: pending?.uid === uid ? pending : null, busy, error, status, conflict, saveDraft, applyPending, cancelPending,
    contacts: previousUid.current===uid?contacts:[], cursor, pickerOpen, loadContacts, chooseContact, closePicker:()=>setPickerOpen(false), saveRecipient,
    previewUrl: ready ? preview!.url : '', previewTitle: ready ? preview!.title : '', ready,
  };
}
