"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { accountFetch } from '@/lib/account/client';
import type { AccountContact, AccountDraft, AccountOccasion, AccountPreferences } from '@/lib/account/contracts';
import type { AccountHistoryOrder } from '@/lib/account/history';

type List<T> = { data: T[]; nextCursor: string | null };

export default function AccountOverviewPage() {
  const { user } = useAuth();
  const [people, setPeople] = useState<AccountContact[]>([]);
  const [occasions, setOccasions] = useState<AccountOccasion[]>([]);
  const [drafts, setDrafts] = useState<AccountDraft[]>([]);
  const [history, setHistory] = useState<AccountHistoryOrder[]>([]);
  const [preferences, setPreferences] = useState<AccountPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const capturedUid = user.uid;
    setLoading(true); setErrors([]); setPeople([]); setOccasions([]); setDrafts([]); setHistory([]);
    void Promise.allSettled([
      accountFetch<List<AccountContact>>(user, '/api/account/people?limit=20'),
      accountFetch<List<AccountOccasion>>(user, '/api/account/occasions?limit=50'),
      accountFetch<List<AccountDraft>>(user, '/api/account/drafts?limit=20'),
      accountFetch<List<AccountHistoryOrder>>(user, '/api/account/history?limit=3'),
      accountFetch<{data:AccountPreferences}>(user, '/api/account/preferences'),
    ]).then(untypedResults => {
      const results = untypedResults as [PromiseSettledResult<List<AccountContact>>, PromiseSettledResult<List<AccountOccasion>>, PromiseSettledResult<List<AccountDraft>>, PromiseSettledResult<List<AccountHistoryOrder>>, PromiseSettledResult<{data:AccountPreferences}>];
      if (!active || user.uid !== capturedUid) return;
      const errorsFound: string[] = [];
      if (results[0].status === 'fulfilled') setPeople(results[0].value.data || []); else errorsFound.push('Your address book could not be loaded.');
      if (results[1].status === 'fulfilled') setOccasions(results[1].value.data || []); else errorsFound.push('Your dates could not be loaded.');
      if (results[2].status === 'fulfilled') setDrafts(results[2].value.data || []); else errorsFound.push('Your drafts could not be loaded.');
      if (results[3].status === 'fulfilled') setHistory(results[3].value.data || []); else errorsFound.push('Your card history could not be loaded.');
      if (results[4].status === 'fulfilled') setPreferences(results[4].value.data); else errorsFound.push('Reminder settings could not be loaded.');
      setErrors([...new Set(errorsFound)]); setLoading(false);
    });
    return () => { active = false; };
  }, [user]);

  const savedDates = occasions.slice(0,3);
  const shortDate = (value: number | null | undefined) => value ? new Date(value).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}) : 'Date not available';
  return <>
    <div className="account-page-heading"><div><p className="account-eyebrow">Your personal collection</p><h1>Your account</h1><p>Make room for the people you care about.</p></div><Link href="/new" className="account-button account-button-primary">Send a card</Link></div>
    {errors.length > 0 && <div className="account-alert" role="status">{errors[0]} <button className="account-quiet-button" onClick={() => { if(user) window.location.reload(); }}>Retry</button></div>}
    {loading ? <div aria-label="Loading your account" aria-busy="true" className="account-panel account-empty"><p>Gathering your account…</p></div> : <>
      <section className="account-section"><div className="account-row"><h2>Saved dates</h2><Link href="/account/dates" className="account-text-link">All dates</Link></div>
        {errors.includes('Your dates could not be loaded.') ? <div role="alert" className="account-panel account-alert">Your dates could not be loaded. <button className="account-quiet-button" onClick={()=>window.location.reload()}>Retry</button></div> : savedDates.length ? <div className="account-panel">{savedDates.map(item => { const reminderStatus = errors.includes('Reminder settings could not be loaded.') ? 'Setting unavailable' : preferences?.remindersPaused ? 'Paused' : item.reminderEnabled ? !preferences?.timeZoneConfirmed ? 'Time zone needed' : preferences?.reminderDeliveryAvailable ? 'Reminder opted in' : 'Email inactive' : 'No reminder'; return <div className="account-row" key={item.id}><span><strong>{item.title}</strong><br/><small className="account-muted">Next occurrence {item.nextOccurrence || 'not available'} · {people.find(person=>person.id===item.contactId)?.displayName || 'Saved person'}</small></span><span className="account-badge">{reminderStatus}</span></div>; })}</div> : <div className="account-panel account-empty"><h3>A date worth remembering?</h3><p>Save a birthday or another occasion. Email reminders are optional, and you choose whether to send a card.</p><Link href="/account/dates" className="account-button">Add a date</Link></div>}
      </section>
      <section className="account-section"><div className="account-row"><h2>Pick up where you left off</h2><Link href="/account/drafts" className="account-text-link">All drafts</Link></div>
        {errors.includes('Your drafts could not be loaded.') ? <div role="alert" className="account-panel account-alert">Your drafts could not be loaded. <button className="account-quiet-button" onClick={()=>window.location.reload()}>Retry</button></div> : drafts[0] ? <div className="account-panel account-row"><span><strong>{drafts[0].title}</strong><br/><small className="account-muted">Saved {shortDate(drafts[0].updatedAt)}</small></span><Link href={`/new?accountDraft=${encodeURIComponent(drafts[0].id)}`} className="account-button">Continue draft</Link></div> : <div className="account-panel account-empty"><p>Your saved drafts will be here when you need a little more time.</p><Link href="/new" className="account-button">Start a card</Link></div>}
      </section>
      <section className="account-section"><div className="account-row"><h2>Recent cards</h2><Link href="/account/history" className="account-text-link">Card history</Link></div>
        {errors.includes('Your card history could not be loaded.') ? <div role="alert" className="account-panel account-alert">Your card history could not be loaded. <button className="account-quiet-button" onClick={()=>window.location.reload()}>Retry</button></div> : history.length ? <div className="account-card-list">{history.map(order=><Link href={`/account/history/${encodeURIComponent(order.id)}`} className="account-history-card" key={order.id}><span className="account-cover-placeholder" aria-hidden="true">{order.frontAvailable ? 'Card' : 'Note'}</span><span><strong>{order.recipientName}</strong><br/><small className="account-muted">{shortDate(order.createdAt)} · {order.customerStatus.replaceAll('_',' ')}</small></span><span aria-hidden="true">›</span></Link>)}</div> : <div className="account-panel account-empty"><h3>Your next note starts here.</h3><p>Cards you’ve sent will appear in your history, with the details saved at the time of the order.</p><Link href="/new" className="account-button">Send your first card</Link></div>}
      </section>
      <section className="account-section account-row"><span><h2>People you care about</h2><small className="account-muted">{errors.includes('Your address book could not be loaded.')?'Your address book could not be loaded.':people.length ? 'Your address book is ready to browse.' : 'Your address book is ready when you are.'}</small></span><Link href="/account/people" className="account-button">Address book</Link></section>
    </>}
  </>;
}
