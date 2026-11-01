"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { accountFetch } from '@/lib/account/client';
import type { AccountHistoryOrder, HistoryStatus } from '@/lib/account/history';

type List = { data: AccountHistoryOrder[]; nextCursor: string|null };
const filters: Array<{key:string;label:string}> = [{key:'all',label:'All cards'},{key:'preparing',label:'Preparing'},{key:'mailed',label:'Mailed'},{key:'attention',label:'Needs attention'}];
const labels: Record<HistoryStatus,string> = {received:'Order received',preparing:'Preparing your card',address_needed:'Address needed',checking:'We’re checking your order',mailed:'Mailed',attention:'Needs attention'};

export default function AccountHistoryPage(){
  const {user}=useAuth(); const [rows,setRows]=useState<AccountHistoryOrder[]>([]); const [cursor,setCursor]=useState<string|null>(null); const [next,setNext]=useState<string|null>(null); const [filter,setFilter]=useState('all'); const [query,setQuery]=useState(''); const [appliedQuery,setAppliedQuery]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const load=useCallback(async(reset=true)=>{if(!user)return;const uid=user.uid;setLoading(true);setError('');try{const params=new URLSearchParams({limit:'20',status:filter});if(appliedQuery)params.set('q',appliedQuery);if(!reset&&cursor)params.set('cursor',cursor);const result=await accountFetch<List>(user,`/api/account/history?${params}`);if(user.uid!==uid)return;setRows(current=>reset?result.data:[...current,...result.data]);setNext(result.nextCursor);setCursor(result.nextCursor);}catch(e){setError(e instanceof Error?e.message:'Card history could not be loaded.');}finally{setLoading(false);}},[user,filter,appliedQuery,cursor]);
  useEffect(()=>{setRows([]);setCursor(null);setNext(null);void load(true);},[user?.uid,filter,appliedQuery]);
  const submit=()=>{setAppliedQuery(query.trim().slice(0,100));};
  return <><div className="account-page-heading"><div><p className="account-eyebrow">Cards you’ve sent</p><h1>Card history</h1><p>Review the details saved with each accepted order.</p></div></div>
    <div className="account-toolbar"><label className="sr-only" htmlFor="history-search">Search cards</label><input id="history-search" className="account-search" value={query} maxLength={100} placeholder="Search person, note or order reference" onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submit();}}/><button className="account-button" onClick={submit}>Search</button></div>
    <div className="account-tabs" role="tablist" aria-label="Filter card history">{filters.map(item=><button key={item.key} role="tab" aria-selected={filter===item.key} onClick={()=>setFilter(item.key)}>{item.label}</button>)}</div>
    {error&&<p role="alert" className="account-alert">{error} <button className="account-quiet-button" onClick={()=>void load(true)}>Retry</button></p>}
    {loading&&rows.length===0?<div className="account-panel account-empty" aria-busy="true">Loading card history…</div>:rows.length===0&&!error?<div className="account-panel account-empty"><h2>{appliedQuery?'No matching cards':'Your history is ready for your first card.'}</h2><p>{appliedQuery?'Try another name, note or order reference.':'Cards you send will be saved here with their order-time details.'}</p>{!appliedQuery&&<Link href="/new" className="account-button account-button-primary">Send a card</Link>}{next&&<button className="account-button" disabled={loading} onClick={()=>void load(false)}>Check older cards</button>}</div>:<div className="account-card-list">{rows.map(order=><Link href={`/account/history/${encodeURIComponent(order.id)}`} className="account-history-card" key={order.id}><span className="account-cover-placeholder" aria-hidden="true">{order.frontAvailable?'Card':'Note'}</span><span><strong>{order.recipientName}</strong><br/><small className="account-muted">{order.createdAt?new Date(order.createdAt).toLocaleDateString(undefined,{month:'long',day:'numeric',year:'numeric'}):'Date not available'} · {labels[order.customerStatus]}</small>{order.occasion&&<small className="account-muted"><br/>{order.occasion}</small>}</span><span aria-hidden="true">›</span></Link>)}</div>}
    {rows.length>0&&<div className="account-pagination"><span className="account-help">Showing {rows.length} cards</span>{next&&<button className="account-button" disabled={loading} onClick={()=>void load(false)}>{loading?'Loading…':'Load more'}</button>}</div>}
  </>;
}
