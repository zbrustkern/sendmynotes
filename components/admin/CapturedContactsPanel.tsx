"use client";

import React, { useEffect, useState } from "react";
import { ManualFollowupPanel } from "./ManualFollowupPanel";
type Contact = { id: string; createdAt: number | null; maskedEmail: string | null };

export function CapturedContactsPanel() {
  const [sourceType, setSourceType] = useState<"feedback" | "account">("feedback");
  const [pages, setPages] = useState<string[]>([""]);
  const cursor = pages[pages.length - 1];
  const [items, setItems] = useState<Contact[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setSelected(null); setItems([]); setNextCursor(null);
    fetch(`/api/admin/followup-contacts?sourceType=${sourceType}&cursor=${encodeURIComponent(cursor)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.error); if (!controller.signal.aborted) { setItems(result.items); setNextCursor(result.nextCursor); } })
      .catch(e => { if (!controller.signal.aborted) setError(e.message || "Could not load contacts."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cursor, refresh, sourceType]);
  return <section className="space-y-4 pb-12" aria-label="Other captured contacts">
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold text-stone-900">Other captured contacts</h2><p className="mt-2 text-sm text-stone-600">People who left feedback or saved an account, including those without an order. Choose one to write a personal reply. Nothing sends automatically.</p></div><button disabled={loading} onClick={() => setRefresh(v => v + 1)} className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50">Refresh</button></div>
    <label className="block text-sm font-medium text-stone-800">Contact source<select value={sourceType} onChange={event => { setSelected(null); setItems([]); setNextCursor(null); setLoading(true); setPages([""]); setSourceType(event.target.value as "feedback" | "account"); }} className="ml-3 rounded-lg border border-stone-300 p-2"><option value="feedback">Feedback contacts</option><option value="account">Account contacts</option></select></label>
    <p className="text-xs text-stone-500">Addresses are masked. Open a feedback contact to review what they submitted privately. Feedback text is not inserted into generated email. Capturing an email is not marketing permission.</p>
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
    {loading ? <p role="status" className="text-sm text-stone-600">Loading contacts…</p> : !items.length && !error ? <p className="rounded-lg bg-stone-50 p-4 text-sm">No contact records on this page.</p> : null}
    <div className="space-y-3">{items.map(contact => <article key={contact.id} className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium text-stone-900">{contact.maskedEmail || "No usable contact email"}</p><p className="mt-1 text-xs text-stone-500">{contact.createdAt ? new Date(contact.createdAt).toLocaleString() : "Date unavailable"} · {contact.id}</p></div><button disabled={!contact.maskedEmail} aria-expanded={selected === contact.id} onClick={() => setSelected(selected === contact.id ? null : contact.id)} className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-40">{selected === contact.id ? "Close email" : "Write personal email"}</button></div>
      {selected === contact.id && <div className="mt-4"><ManualFollowupPanel key={`${sourceType}:${contact.id}`} sourceType={sourceType} sourceId={contact.id}/></div>}
    </article>)}</div>
    <div className="flex items-center gap-3"><button disabled={loading || pages.length === 1} onClick={() => setPages(current => current.slice(0,-1))} className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-40">Previous page</button><span className="text-sm text-stone-600">Page {pages.length}</span><button disabled={loading || !nextCursor} onClick={() => { if (nextCursor) setPages(current => [...current,nextCursor]); }} className="rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-40">Next page</button></div>
  </section>;
}
