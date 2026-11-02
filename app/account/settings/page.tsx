"use client";

import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { accountFetch } from '@/lib/account/client';
import type { AccountPreferences } from '@/lib/account/contracts';
import type { MailingAddress } from '@/lib/types';

type RequestRow = { id: string; kind: 'export'|'deletion'; status: 'received'|'manual_review'|'in_progress'|'completed'|'needs_info'; createdAt: number; updatedAt: number; version: number; assigned: boolean };
const blankAddress: MailingAddress = { firstName:'',lastName:'',street1:'',street2:'',city:'',state:'',zip:'',country:'US' };
const timeZones = ['America/Chicago','America/New_York','America/Denver','America/Los_Angeles','America/Phoenix','America/Anchorage','Pacific/Honolulu','UTC'];

export default function AccountSettingsPage() {
  const { user } = useAuth();
  const [prefs,setPrefs] = useState<AccountPreferences|null>(null);
  const [name,setName] = useState(''); const [address,setAddress] = useState<MailingAddress>(blankAddress);
  const [clearAddress,setClearAddress] = useState(false); const [zone,setZone] = useState('America/Chicago'); const [zoneConfirmed,setZoneConfirmed] = useState(false); const [paused,setPaused] = useState(false);
  const [requests,setRequests] = useState<RequestRow[]>([]); const [loading,setLoading] = useState(true); const [saving,setSaving] = useState(false); const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [confirmDeletion,setConfirmDeletion] = useState(false); const [deletionAgreed,setDeletionAgreed] = useState(false);
  const [requestKeys,setRequestKeys] = useState<Partial<Record<'export'|'deletion',string>>>({});

  useEffect(()=>{ if(!user)return; let active=true; const uid=user.uid; setLoading(true); setError('');
    Promise.allSettled([accountFetch<{data:AccountPreferences}>(user,'/api/account/preferences'),accountFetch<{data:RequestRow[]}>(user,'/api/account/privacy-requests')]).then(([p,r])=>{
      if(!active||user.uid!==uid)return;
      if(p.status==='fulfilled'){const value=p.value.data;setPrefs(value);setName(value.displayName||user.displayName||'');setAddress(value.defaultReturnAddress||blankAddress);setZone(value.timeZone);setZoneConfirmed(value.timeZoneConfirmed===true);setPaused(value.remindersPaused);}
      else setError('Your settings could not be loaded. Try again.');
      if(r.status==='fulfilled')setRequests(r.value.data||[]);else setError(current=>current||'Privacy requests could not be loaded.');
      setLoading(false);
    }); return()=>{active=false;};
  },[user]);

  const save = async (event:FormEvent) => {event.preventDefault();if(!user||!prefs)return;setSaving(true);setError('');setNotice('');
    try{const result=await accountFetch<{data:AccountPreferences}>(user,'/api/account/preferences',{method:'PATCH',body:JSON.stringify({expectedVersion:prefs.version,displayName:name,defaultReturnAddress:clearAddress?null:address,timeZone:zone,confirmTimeZone:zoneConfirmed,remindersPaused:paused})});setPrefs(result.data);setAddress(result.data.defaultReturnAddress||blankAddress);setClearAddress(!result.data.defaultReturnAddress);setZoneConfirmed(result.data.timeZoneConfirmed===true);setNotice('Your settings are saved.');}
    catch(e){setError(e instanceof Error?e.message:'Your settings could not be saved. Your entries are still here.');}finally{setSaving(false);}
  };

  const request = async(kind:'export'|'deletion')=>{if(!user)return;if(kind==='deletion'&&!deletionAgreed)return;setError('');setNotice('');setSaving(true);
    const key=requestKeys[kind]||crypto.randomUUID();setRequestKeys(current=>({...current,[kind]:key}));
    try{const result=await accountFetch<{data:RequestRow}>(user,'/api/account/privacy-requests',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify({kind,...(kind==='deletion'?{confirm:true}:{})})});setRequests(current=>[result.data,...current.filter(item=>item.id!==result.data.id)]);setRequestKeys(current=>({...current,[kind]:undefined}));setNotice(kind==='export'?'Your data export request has been recorded. Check its status below; it is not complete until marked complete.':'Your deletion request has been recorded. Check its status below; your account has not been deleted.');if(kind==='deletion')setConfirmDeletion(false);}
    catch(e){setError(e instanceof Error?e.message:'Your request could not be submitted. Please try again.');}finally{setSaving(false);}
  };
  const requestStatus=(status:RequestRow['status'])=>({received:'Received',manual_review:'Awaiting manual review',in_progress:'In progress',completed:'Completed',needs_info:'More information needed'}[status]);
  const field=(label:keyof MailingAddress,title:string,required=false)=><label className="account-field" key={label}>{title}<input value={address[label]||''} required={required&&!clearAddress} disabled={clearAddress} autoComplete={label==='firstName'?'given-name':label==='lastName'?'family-name':label==='street1'?'address-line1':label==='street2'?'address-line2':label==='city'?'address-level2':label==='state'?'address-level1':label==='zip'?'postal-code':undefined} onChange={e=>setAddress(current=>({...current,[label]:e.target.value}))}/></label>;
  return <>
    <div className="account-page-heading"><div><p className="account-eyebrow">A few details for next time</p><h1>Settings</h1><p>Keep your sender details current and choose how reminders work.</p></div></div>
    {error&&<p role="alert" className="account-alert">{error} <button className="account-quiet-button" onClick={()=>window.location.reload()}>Retry</button></p>}{notice&&<p role="status" className="account-success">{notice}</p>}
    {loading?<div className="account-panel account-empty" aria-busy="true">Loading your settings…</div>:prefs&&<form className="account-form" onSubmit={save}>
      <section className="account-section account-panel"><h2>Your profile</h2><label className="account-field">Name<input autoComplete="name" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><div className="account-row"><span><strong>Account email</strong><br/><small className="account-muted">Sign-in and account identity</small></span><span>{user?.email||'Not available'}<br/><small className="account-muted">{user?.emailVerified?'Verified':'Not verified'}</small></span></div><p className="account-help">Reminder emails can only use your current verified account email. Changing your sign-in email requires verification before reminders can resume.</p></section>
      <section className="account-section account-panel"><h2>Default return address</h2><p className="account-muted">Your personal sender name and address appear on the envelope.</p><label className="account-check"><input type="checkbox" checked={clearAddress} onChange={e=>setClearAddress(e.target.checked)}/><span>Remove my saved default return address</span></label><div className="account-form-grid">{field('firstName','First name',true)}{field('lastName','Last name (optional)')}{field('street1','Street address',true)}{field('street2','Apartment or unit')}{field('city','City',true)}{field('state','State or region',true)}{field('zip','Postal code',true)}{field('country','Country code')}</div><p className="account-help">Return addresses must be personal United States addresses. A last name is optional.</p></section>
      <section className="account-section account-panel"><h2>Emails & time zone</h2><label className="account-field">Reminder time zone<select value={zone} onChange={e=>{const next=e.target.value;if(next!==zone)setZoneConfirmed(false);setZone(next);}}>{Array.from(new Set([...timeZones,zone])).map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label><label className="account-check" style={{marginTop:16}}><input type="checkbox" checked={zoneConfirmed} onChange={e=>setZoneConfirmed(e.target.checked)}/><span><strong>I confirm reminder timing at 9:00 a.m. in {zone}.</strong><br/><small className="account-muted">This confirms the local time used for occasion reminders. Changing the time zone requires confirming again.</small></span></label><label className="account-check" style={{marginTop:16}}><input type="checkbox" checked={paused} onChange={e=>setPaused(e.target.checked)}/><span><strong>Pause all occasion reminders</strong><br/><small className="account-muted">Your dates stay saved. Necessary order updates are separate.</small></span></label><p className="account-help">{!zoneConfirmed?'Confirm the time zone before any occasion reminder can be scheduled.':prefs.reminderDeliveryAvailable?'Reminder delivery is configured.':'Email reminder delivery is not active yet. You can manage your date choices; no occasion emails will be sent until delivery is activated.'}</p><p><a className="account-text-link" href="/account/dates">Manage individual dates and reminders</a></p></section>
      <button type="submit" className="account-button account-button-primary" disabled={saving}>{saving?'Saving…':'Save settings'}</button>
    </form>}
    <section className="account-section account-panel"><h2>Privacy & account</h2><p className="account-muted">Requests are recorded for manual review. Submitting a request does not download data or instantly delete the account.</p><div className="account-toolbar"><button className="account-button" disabled={saving||loading} onClick={()=>void request('export')}>Request my data</button><button className="account-button account-button-danger" disabled={saving||loading} onClick={()=>setConfirmDeletion(value=>!value)}>Request account deletion</button></div>
      {confirmDeletion&&<div className="account-alert"><p><strong>Deletion requires review.</strong> Your request will be recorded for manual review. This button does not immediately delete your account or past order records.</p><label className="account-check"><input type="checkbox" checked={deletionAgreed} onChange={e=>setDeletionAgreed(e.target.checked)}/><span>I understand this submits a deletion request for review.</span></label><button type="button" className="account-button account-button-danger" disabled={saving||!deletionAgreed} onClick={()=>void request('deletion')}>Submit deletion request</button><button type="button" className="account-quiet-button" onClick={()=>{setConfirmDeletion(false);setDeletionAgreed(false);}}>Cancel</button></div>}
      {requests.length>0&&<div className="account-section"><h3>Request history</h3>{requests.map(item=><div className="account-row" key={item.id}><span><strong>{item.kind==='export'?'Data export':'Account deletion'}</strong><br/><small className="account-muted">Submitted {new Date(item.createdAt).toLocaleDateString()}</small>{item.assigned&&<><br/><small className="account-muted">A team member is assigned.</small></>}</span><span className="account-badge">{requestStatus(item.status)}</span></div>)}</div>}
    </section>
  </>;
}
