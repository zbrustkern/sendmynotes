"use client";
import {useState} from "react";
import {useAuth} from "@/context/AuthContext";
import {authHeaders,errorMessage,type PanelProps,type Member} from "./client";
import {PrivateLink} from "./PeoplePanel";
export function SharingPanel({state,mutate,signIn,notify}:PanelProps){
 const [link,setLink]=useState(""),[issued,setIssued]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[includeGift,setIncludeGift]=useState(false);
 const {user,reloadUserAndRefreshToken,sendVerificationEmail}=useAuth();
 const owner=state.actor.role==="owner";
 const work=async(fn:()=>Promise<void>)=>{setBusy(true);setError("");try{await fn();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
 async function claim(){if(!user){signIn();return;}await reloadUserAndRefreshToken();await mutate("claim");notify("Verified account linked to this project.");}
 async function invite(kind:string){const result=await mutate("invite",{kind});setLink(String(result.link));setIssued(String(result.inviteId));}
 async function download(){
   if(!state.actor.verified){signIn();return;}
   const res=await fetch("/api/wedding/project?export=1&includeGift="+(includeGift?"1":"0"),{credentials:"same-origin",cache:"no-store",headers:await authHeaders()});if(!res.ok){const d=await res.json().catch(()=>({}));throw Error(d.error||"Export could not be downloaded.");}
   const url=URL.createObjectURL(await res.blob()),a=document.createElement("a");a.href=url;a.download="wedding-thank-you-tracker.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <details className="wed-panel"><summary>Manage sharing, recovery and tracker</summary>
 <p>Project access expires {new Date(state.project.expiresAt).toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"})}.</p>
 <div className="wed-actions">{owner&&<><button disabled={busy} onClick={()=>void work(()=>invite("device"))}>Recovery or add-device link</button><button disabled={busy} onClick={()=>void work(()=>invite("partner"))}>Invite a partner to edit</button><button disabled={busy} onClick={()=>void work(async()=>{await mutate("extend");notify("Project access extended.");})}>Extend my project</button></>}</div>
 {link&&<><PrivateLink link={link}/><button disabled={busy} onClick={()=>void work(async()=>{await mutate("revokeInvite",{inviteId:issued});setIssued("");setLink("");notify("Private link revoked.");})}>Revoke this link</button></>}
 {!state.actor.verified&&<div className="wed-notice"><p>Link a verified account to export a household tracker or use delegated permissions.</p><button disabled={busy} onClick={()=>void work(claim)}>{user?"Verify and link account":"Sign in to link account"}</button>{user&&!user.emailVerified&&<button onClick={()=>void work(async()=>{await sendVerificationEmail();notify("Verification email requested.");})}>Request verification email</button>}</div>}
 {owner&&state.members?.filter(m=>m.role==="editor"&&!m.revoked).map((m,i)=><Partner key={m.actorId||m.id} member={m} index={i} onSave={(pay,exp)=>work(async()=>{await mutate("grant",{actorId:m.actorId||m.id,canPay:pay,canExport:exp});notify("Partner permissions saved.");})} onRevoke={()=>work(async()=>{await mutate("revoke",{actorId:m.actorId||m.id});notify("Partner access revoked.");})}/>)}
 {owner&&state.sessions&&state.sessions.length>0&&<><h3>Active devices</h3><ul className="wed-list">{state.sessions.map((s,i)=><li key={s.sessionId}>Device {i+1}{s.current?" · this device":""} {!s.revoked&&!s.current&&<button onClick={()=>void work(async()=>{await mutate("revokeSession",{sessionId:s.sessionId});notify("Device access revoked.");})}>Revoke device</button>}</li>)}</ul></>}
 {owner&&!!state.invites?.length&&<details><summary>Outstanding private links</summary>{state.invites.map(i=><p key={i.inviteId}>{i.kind} · expires {new Date(i.expiresAt).toLocaleString()} <button disabled={busy} onClick={()=>void work(async()=>{await mutate("revokeInvite",{inviteId:i.inviteId});notify("Link revoked.");})}>Revoke link</button></p>)}</details>}
 {(owner||state.actor.canExport)&&<><h3>Private tracker</h3><p>Download household names, note and mailing status. Street addresses and messages are omitted.</p><label><input type="checkbox" checked={includeGift} onChange={e=>setIncludeGift(e.target.checked)}/>Include gift descriptions</label><button disabled={busy} onClick={()=>void work(download)}>Download tracker CSV</button></>}
 {error&&<p role="alert" className="wed-notice">{error} <button onClick={signIn}>Verify sign-in</button></p>}</details>;
}
function Partner({member:m,index,onSave,onRevoke}:{member:Member;index:number;onSave:(pay:boolean,exp:boolean)=>Promise<void>;onRevoke:()=>Promise<void>}){
 const [pay,setPay]=useState(m.canPay),[exp,setExp]=useState(m.canExport);
 return <fieldset><legend>Partner editor {index+1}</legend><label><input type="checkbox" checked={pay} onChange={e=>setPay(e.target.checked)}/>Can pay for cards</label><label><input type="checkbox" checked={exp} onChange={e=>setExp(e.target.checked)}/>Can export the tracker</label><div className="wed-actions"><button disabled={pay===m.canPay&&exp===m.canExport} onClick={()=>void onSave(pay,exp)}>Save permissions</button><button onClick={()=>void onRevoke()}>Revoke partner access</button></div></fieldset>;
}
