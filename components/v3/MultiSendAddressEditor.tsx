"use client";
import React, { useEffect, useState } from "react";
import type { MultiSendDraft, MultiSendRecipientDraft, GreetingChoice, AddressDraft } from "@/lib/draft/types";
import { US_STATES } from "./Step3EnvelopeAddressing";
import { normalizedMailingAddressKey } from "@/lib/multi-send/contracts";
import { setHouseholdAcknowledgements } from "@/lib/multi-send/household";
import { parseMultiSendEditorBuffer, type MultiSendEditorBuffer } from "@/lib/draft/multi-send-editor-buffer";

function greetingFor(recipient: MultiSendRecipientDraft, fallback: string) {
  return recipient.greeting.mode === "inherit" ? fallback : recipient.greeting.text;
}
export function MultiSendAddressEditor({
  value, onChange, onRemove, onUndo, onUndoRemoval, hasUndoRemoval, defaultGreeting, bodyNote, signOff, onPreviewRecipient, onLivePreview, editRecipientId, onEditConsumed, unsavedGuard, openNewRecipient, onOpenNewConsumed, editAddressId, onAddressEditConsumed, selectedPreviewId,
}: {
  value: MultiSendDraft; onChange: (next: MultiSendDraft) => void; onRemove: (id: string) => void;
  onUndo: () => void; onUndoRemoval?: () => void; hasUndoRemoval?: boolean; defaultGreeting: string; editRecipientId?: string | null;
  onEditConsumed?: () => void; unsavedGuard?: (unsaved: boolean, focus?: () => void) => void;
  openNewRecipient?: boolean; onOpenNewConsumed?: () => void;
  editAddressId?: string | null; onAddressEditConsumed?: () => void;
  selectedPreviewId?: string | null;
  bodyNote: string; signOff: string; onPreviewRecipient?: (id: string) => void; onLivePreview?: (id: string, greeting: string, unsaved: boolean) => void;
}) {
  const [savedBuffer] = useState<MultiSendEditorBuffer | null>(() => { try { return typeof window === "undefined" ? null : parseMultiSendEditorBuffer(window.sessionStorage.getItem("sendmynotes:multi-send-editor-buffer"), value.checkoutId); } catch { return null; } });
  const [addressId, setAddressId] = useState<string | null>(savedBuffer?.mode === "address" && (savedBuffer.newRecipient || value.recipients.some(r => r.id === savedBuffer.recipientId)) ? savedBuffer.recipientId : null);
  const [addressDraft, setAddressDraft] = useState<AddressDraft | null>(savedBuffer?.mode === "address" && (savedBuffer.newRecipient || value.recipients.some(r => r.id === savedBuffer.recipientId)) ? savedBuffer.address : null);
  const [newRecipientId, setNewRecipientId] = useState<string | null>(savedBuffer?.mode === "address" && savedBuffer.newRecipient ? savedBuffer.recipientId : null);
  const [greetingId, setGreetingId] = useState<string | null>(savedBuffer?.mode === "greeting" && value.recipients.some(r => r.id === savedBuffer.recipientId) ? savedBuffer.recipientId : null);
  const [greetingDraft, setGreetingDraft] = useState(savedBuffer?.mode === "greeting" ? savedBuffer.text : "");
  const [aptVisible, setAptVisible] = useState(Boolean(savedBuffer?.mode === "address" && savedBuffer.address.addressLine2));
  const [rowError, setRowError] = useState("");
  const [householdReview, setHouseholdReview] = useState<{ signature: string; names: string[] } | null>(null);
  const [previewId, setPreviewId] = useState(savedBuffer?.mode === "greeting" ? savedBuffer.recipientId : selectedPreviewId || value.recipients[0]?.id || "");
  useEffect(() => { if (selectedPreviewId && selectedPreviewId !== previewId) setPreviewId(selectedPreviewId); }, [selectedPreviewId]);
  const openAddress = (row: MultiSendRecipientDraft) => { setAddressId(row.id); setAddressDraft({ ...row.address }); setAptVisible(Boolean(row.address.addressLine2)); setRowError(""); };
  const addressRef = React.useRef<HTMLInputElement>(null);
  const householdReviewRef = React.useRef<HTMLDivElement>(null);
  const greetingRef = React.useRef<HTMLTextAreaElement>(null);
  const dirty = addressId !== null || greetingId !== null;
  useEffect(() => { if (householdReview) { householdReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); householdReviewRef.current?.focus(); } }, [householdReview]);
  useEffect(() => {
    try {
    if (!dirty) { window.sessionStorage.removeItem("sendmynotes:multi-send-editor-buffer"); return; }
    const buffer: MultiSendEditorBuffer | null = addressId && addressDraft
      ? { checkoutId: value.checkoutId, mode: "address", recipientId: addressId, newRecipient: newRecipientId === addressId, address: addressDraft }
      : greetingId ? { checkoutId: value.checkoutId, mode: "greeting", recipientId: greetingId, text: greetingDraft } : null;
    if (buffer) window.sessionStorage.setItem("sendmynotes:multi-send-editor-buffer", JSON.stringify(buffer));
    } catch { /* Editing remains available when browser storage is unavailable. */ }
  }, [dirty, addressId, addressDraft, newRecipientId, greetingId, greetingDraft, value.checkoutId]);
  useEffect(() => { unsavedGuard?.(dirty, () => { const el = addressId ? addressRef.current : greetingRef.current; el?.scrollIntoView({ behavior: "smooth", block: "center" }); el?.focus(); }); }, [dirty, unsavedGuard, addressId]);
  useEffect(() => {
    if (!editRecipientId) return;
    const row = value.recipients.find((r) => r.id === editRecipientId);
    if (row) { setGreetingId(row.id); setGreetingDraft(greetingFor(row, defaultGreeting)); setPreviewId(row.id); onPreviewRecipient?.(row.id); }
    onEditConsumed?.();
  }, [editRecipientId]);
  const startNewRecipient = () => { if (dirty) return; const id = crypto.randomUUID(); setNewRecipientId(id); setAddressId(id); setAddressDraft({ name:"",addressLine1:"",addressLine2:"",city:"",state:"",zip:"",country:"US" }); setAptVisible(false); setRowError(""); };
  useEffect(() => { if (openNewRecipient) { startNewRecipient(); onOpenNewConsumed?.(); } }, [openNewRecipient]);
  useEffect(() => { if (!editAddressId) return; const row = value.recipients.find(r=>r.id===editAddressId); if(row) openAddress(row); onAddressEditConsumed?.(); }, [editAddressId]);
  const change = (id: string, key: keyof AddressDraft, text: string) => { setHouseholdReview(null); setRowError(""); setAddressDraft((prev) => prev ? { ...prev, [key]: text } : prev); };
  const saveAddress = (confirmed = false) => {
    if (!addressDraft || !addressId) return;
    if (![addressDraft.name, addressDraft.addressLine1, addressDraft.city, addressDraft.state, addressDraft.zip].every((x) => x.trim())) { setRowError("Complete the name and mailing address before saving."); return; }
    const candidate = { ...addressDraft, id: newRecipientId || addressId };
    const addressKey = normalizedMailingAddressKey({ firstName: addressDraft.name.trim().split(/\s+/)[0] || "", lastName: addressDraft.name.trim().split(/\s+/).slice(1).join(" "), street1: addressDraft.addressLine1, street2: addressDraft.addressLine2, city: addressDraft.city, state: addressDraft.state, zip: addressDraft.zip, country: addressDraft.country || "US" });
    const peers = value.recipients.filter(r => r.id !== candidate.id && normalizedMailingAddressKey({ firstName:r.address.name.split(/\s+/)[0]||"",lastName:r.address.name.split(/\s+/).slice(1).join(" "),street1:r.address.addressLine1,street2:r.address.addressLine2,city:r.address.city,state:r.address.state,zip:r.address.zip,country:r.address.country||"US" }) === addressKey);
    if (peers.some(peer => peer.address.name.trim().toLowerCase() === addressDraft.name.trim().toLowerCase())) { setRowError("This exact recipient and address are already on the list."); return; }
    const reviewSignature = JSON.stringify({ id: candidate.id, name: addressDraft.name.trim().toLowerCase(), addressKey, peerIds: peers.map((peer) => peer.id).sort() });
    if (peers.length && (!confirmed || householdReview?.signature !== reviewSignature)) {
      setHouseholdReview({ signature: reviewSignature, names: peers.map((peer) => peer.address.name) });
      return;
    }
    if (newRecipientId === addressId) {
      const appended = { id: newRecipientId, address: addressDraft, greeting: { mode: "inherit" as const } };
      const withNew = [...value.recipients, appended];
      onChange({ ...value, recipients: peers.length ? setHouseholdAcknowledgements(withNew, newRecipientId, peers.map(peer => peer.id), addressKey) : withNew });
      setNewRecipientId(null);
    } else {
      const edited = value.recipients.map((r) => r.id === addressId ? { ...r, address: addressDraft } : r);
      onChange({ ...value, recipients: setHouseholdAcknowledgements(edited, addressId, peers.map(peer => peer.id), addressKey) });
    }
    setAddressId(null); setAddressDraft(null); setRowError(""); setHouseholdReview(null);
  };
  const saveGreeting = () => { if (!greetingId) return; onChange({ ...value, recipients: value.recipients.map((r) => r.id === greetingId ? { ...r, greeting: { mode: "custom", text: greetingDraft } } : r) }); setGreetingId(null); };
  const previewRecipient = value.recipients.find((r) => r.id === previewId) || value.recipients[0];
  useEffect(() => { if (previewRecipient) onLivePreview?.(previewRecipient.id, greetingId === previewRecipient.id ? greetingDraft : greetingFor(previewRecipient, defaultGreeting), greetingId === previewRecipient.id); }, [previewRecipient?.id, greetingId, greetingDraft, defaultGreeting]);
  return <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4" aria-label="Multiple recipients">
    <header><h3 className="font-semibold text-stone-900">Recipients ({value.recipients.length})</h3><p className="text-xs text-stone-600">Each person gets the same card. Shared message, handwriting, and return address stay the same.</p></header>
    {previewRecipient && <section className="rounded-xl border border-stone-200 bg-[#FDFCF7] p-4"><label className="text-xs font-semibold">Preview card for<select className="ml-2 rounded border border-stone-300 p-1" value={previewRecipient.id} onChange={e=>{setPreviewId(e.target.value);onPreviewRecipient?.(e.target.value);}}>{value.recipients.map(r=><option key={r.id} value={r.id}>{r.address.name || "New recipient"}</option>)}</select></label>{greetingId === previewRecipient.id && <span className="ml-2 text-xs text-amber-800">Unsaved preview shown on card</span>}</section>}
    {value.recipients.map((row, index) => <article key={row.id} className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-semibold">{row.address.name || `Recipient ${index + 1}`}</h4><p className="text-xs text-stone-600">{[row.address.addressLine1, row.address.addressLine2, row.address.city, row.address.state, row.address.zip].filter(Boolean).join(", ") || "Address needed"}</p></div><div className="flex gap-3"><button type="button" disabled={dirty} className="text-xs underline disabled:opacity-50" onClick={() => openAddress(row)}>Edit address</button><button type="button" disabled={dirty} className="text-xs underline disabled:opacity-50" onClick={() => onRemove(row.id)}>Remove</button></div></div>
      {addressId === row.id && addressDraft && <div className="space-y-3 rounded-lg bg-stone-50 p-3">
        <label className="block text-xs font-semibold">Recipient name<input autoComplete={`section-recipient-${row.id} name`} ref={addressRef} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base font-normal" value={addressDraft.name} onChange={e=>change(row.id,"name",e.target.value)} autoFocus /></label>
        <label className="block text-xs font-semibold">Street address<input autoComplete={`section-recipient-${row.id} address-line1`} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base font-normal" value={addressDraft.addressLine1} onChange={e=>change(row.id,"addressLine1",e.target.value)} /></label>
        {aptVisible ? <label className="block text-xs font-semibold">Apartment, Suite, Unit<input autoComplete={`section-recipient-${row.id} address-line2`} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base font-normal" value={addressDraft.addressLine2||""} onChange={e=>change(row.id,"addressLine2",e.target.value)} /></label> : <button type="button" className="text-xs font-semibold underline" onClick={()=>setAptVisible(true)}>+ Add Apt / Suite / Unit</button>}
        <label className="block text-xs font-semibold">City<input autoComplete={`section-recipient-${row.id} address-level2`} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base font-normal" value={addressDraft.city} onChange={e=>change(row.id,"city",e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold">State<select autoComplete={`section-recipient-${row.id} address-level1`} className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-2.5 text-base" value={addressDraft.state} onChange={e=>change(row.id,"state",e.target.value)}><option value="">Select</option>{US_STATES.map(s=><option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}</select></label><label className="text-xs font-semibold">ZIP Code<input autoComplete={`section-recipient-${row.id} postal-code`} inputMode="numeric" className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base font-normal" value={addressDraft.zip} onChange={e=>change(row.id,"zip",e.target.value)} /></label></div>
        {rowError && <p role="alert" className="text-xs text-red-700">{rowError}</p>}{householdReview && <div ref={householdReviewRef} tabIndex={-1} role="alert" aria-live="polite" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p>This address is also used for {householdReview.names.join(", ")}. Send separate cards to everyone at this address?</p><div className="mt-3 flex flex-wrap gap-4"><button type="button" className="font-semibold underline" onClick={()=>saveAddress(true)}>Send separate cards</button><button type="button" className="underline" onClick={()=>setHouseholdReview(null)}>Keep editing</button></div></div>}<div className="flex gap-4"><button type="button" className="font-semibold text-sm underline" onClick={()=>saveAddress()}>Save address</button><button type="button" className="text-sm underline" onClick={()=>{setAddressId(null);setAddressDraft(null);setRowError("");setHouseholdReview(null);}}>Cancel</button></div>
      </div>}
      <div className="border-t pt-3"><p className="text-xs text-stone-600">Inside greeting · {row.greeting.mode === "inherit" ? "Default" : "Personalized"}</p><p className="whitespace-pre-wrap text-sm text-stone-900">{greetingFor(row, defaultGreeting) || "No greeting"}</p>
        {greetingId === row.id ? <div className="mt-3 space-y-2"><label className="block text-xs font-semibold">Inside greeting for {row.address.name || `recipient ${index + 1}`}<textarea ref={greetingRef} autoFocus rows={2} value={greetingDraft} onChange={e=>setGreetingDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 p-3 text-base font-normal" /></label><p className="text-xs text-stone-600">Only this opening line changes. Message and sign-off stay the same. Leave blank for no greeting.</p><div className="flex flex-wrap gap-3"><button className="font-semibold text-sm underline" type="button" onClick={saveGreeting}>Save greeting</button><button className="text-sm underline" type="button" onClick={()=>setGreetingId(null)}>Cancel</button><button className="text-sm underline" type="button" onClick={()=>{onChange({...value,recipients:value.recipients.map(r=>r.id===row.id?{...r,greeting:{mode:"inherit"}}:r)});setGreetingId(null);}}>Use default greeting <span className="font-normal">({defaultGreeting || "No greeting"})</span></button></div></div> : <button disabled={addressId!==null || greetingId!==null} type="button" className="mt-2 text-sm font-semibold text-emerald-800 underline disabled:opacity-50" onClick={()=>{setGreetingId(row.id);setGreetingDraft(greetingFor(row,defaultGreeting));setPreviewId(row.id);onPreviewRecipient?.(row.id);}}>{row.greeting.mode === "inherit" ? "Personalize greeting" : "Edit greeting"}</button>}
      </div>
    </article>)}
    {newRecipientId && addressDraft && <article className="rounded-xl border border-emerald-300 bg-white p-4 space-y-3"><h4 className="text-sm font-semibold">New recipient</h4>
      <label className="block text-xs font-semibold">Recipient name<input autoComplete={`section-recipient-${newRecipientId} name`} ref={addressRef} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base font-normal" value={addressDraft.name} onChange={e=>change(newRecipientId,"name",e.target.value)} autoFocus /></label>
      <label className="block text-xs font-semibold">Street address<input autoComplete={`section-recipient-${newRecipientId} address-line1`} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base font-normal" value={addressDraft.addressLine1} onChange={e=>change(newRecipientId,"addressLine1",e.target.value)} /></label>
      {aptVisible ? <label className="block text-xs font-semibold">Apartment, Suite, Unit<input autoComplete={`section-recipient-${newRecipientId} address-line2`} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base font-normal" value={addressDraft.addressLine2||""} onChange={e=>change(newRecipientId,"addressLine2",e.target.value)} /></label> : <button type="button" className="text-xs font-semibold underline" onClick={()=>setAptVisible(true)}>+ Add Apt / Suite / Unit</button>}
      <label className="block text-xs font-semibold">City<input autoComplete={`section-recipient-${newRecipientId} address-level2`} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base font-normal" value={addressDraft.city} onChange={e=>change(newRecipientId,"city",e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold">State<select autoComplete={`section-recipient-${newRecipientId} address-level1`} className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-2.5 text-base" value={addressDraft.state} onChange={e=>change(newRecipientId,"state",e.target.value)}><option value="">Select</option>{US_STATES.map(s=><option key={s.code} value={s.code}>{s.code} - {s.name}</option>)}</select></label><label className="text-xs font-semibold">ZIP Code<input autoComplete={`section-recipient-${newRecipientId} postal-code`} inputMode="numeric" className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-base font-normal" value={addressDraft.zip} onChange={e=>change(newRecipientId,"zip",e.target.value)} /></label></div>
      {rowError && <p role="alert" className="text-xs text-red-700">{rowError}</p>}{householdReview && <div ref={householdReviewRef} tabIndex={-1} role="alert" aria-live="polite" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p>This address is also used for {householdReview.names.join(", ")}. Send separate cards to everyone at this address?</p><div className="mt-3 flex flex-wrap gap-4"><button type="button" className="font-semibold underline" onClick={()=>saveAddress(true)}>Send separate cards</button><button type="button" className="underline" onClick={()=>setHouseholdReview(null)}>Keep editing</button></div></div>}<div className="flex gap-4"><button type="button" className="font-semibold text-sm underline" onClick={()=>saveAddress()}>Save recipient</button><button type="button" className="text-sm underline" onClick={()=>{setNewRecipientId(null);setAddressId(null);setAddressDraft(null);setRowError("");setHouseholdReview(null);if(value.recipients.length===1)onUndo();}}>Cancel</button></div>
    </article>}
    <div className="flex flex-wrap gap-4"><button type="button" onClick={startNewRecipient} disabled={value.recipients.length>=25 || dirty} className="min-h-11 text-sm font-semibold text-emerald-800 underline disabled:opacity-50">+ Add another recipient</button>{value.recipients.length>1 && <button type="button" disabled={dirty} onClick={onUndo} className="min-h-11 text-sm text-stone-700 underline disabled:opacity-50">Keep one recipient</button>}{hasUndoRemoval && onUndoRemoval && <button type="button" disabled={dirty} onClick={onUndoRemoval} className="min-h-11 text-sm text-stone-700 underline disabled:opacity-50">Undo recipient removal</button>}</div>
  </section>;
}
