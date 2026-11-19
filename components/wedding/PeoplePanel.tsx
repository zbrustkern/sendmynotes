"use client";
import {useState} from "react";
import {useAuth} from "@/context/AuthContext";
import { newWeddingHousehold, weddingAddressReady } from "@/lib/wedding/domain";
import type {WeddingImportRow} from "@/lib/wedding/import-contract";
import WeddingListImport from "./WeddingListImport";
import {AddressFields} from "./AddressFields";
import {authHeaders,blankAddress,errorMessage, formatAddress,type Person,type PanelProps} from "./client";

export function PrivateLink({link}:{link:string}){
 const url=new URL(link,typeof window==="undefined"?"https://sendmynotes.com":location.origin);
 const [copied,setCopied]=useState(false);
 return <div className="wed-notice"><label>Private link<input value={url.href} readOnly onFocus={e=>e.currentTarget.select()}/></label><button onClick={async()=>{try{await navigator.clipboard.writeText(url.href);setCopied(true);}catch{setCopied(false);}}}>{copied?"Copied":"Copy link"}</button></div>;
}
function importPatch(r:WeddingImportRow,rows:WeddingImportRow[]) {
 const repeated=r.sourceId&&rows.filter(other=>other.sourceId===r.sourceId).length>1;
 return {...r,sourceId:repeated?r.id:r.sourceId||r.id,sourceRowId:r.source,firstName:r.firstName||r.envelopeName,
  addressConfirmed:Boolean(r.street1&&r.city&&r.zip&&r.country),identityConfirmed:Boolean(r.envelopeName),insideNameConfirmed:Boolean(r.insideNames)};
}
export function PeoplePanel(props:PanelProps & {editId:string|null;onEdit:(id:string|null)=>void}){
 const {state,mutate,notify,editId,onEdit,signIn}=props;
 const [adding,setAdding]=useState(false),[importing,setImporting]=useState(false),[search,setSearch]=useState(""),[issuesOnly,setIssuesOnly]=useState(false);
 const [link,setLink]=useState(""),[error,setError]=useState(""),[contact,setContact]=useState("");
 const {account,user}=useAuth();
 const source=state.households.find(r=>r.id===editId);
 const [prefill,setPrefill]=useState<Person|null>(null);
 const visible=state.households.filter(r=>(!issuesOnly||!weddingAddressReady(r)||!r.insideNameConfirmed||!r.identityConfirmed||r.pendingAddress) && (r.envelopeName+" "+r.insideName+" "+r.gift).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>Number(weddingAddressReady(a))-Number(weddingAddressReady(b)));
 const work=async(fn:()=>Promise<void>)=>{setError("");try{await fn();}catch(e){setError(errorMessage(e));}};
 function newRow(){onEdit(null);setPrefill(null);setAdding(true);setLink("");}
 async function apply(rows:WeddingImportRow[],importId:string){await mutate("importHouseholds",{importId,rows:rows.map(r=>importPatch(r,rows))});setImporting(false);notify("The reviewed households were saved to your project.");}
 return <><div className="wed-actions"><button className="wed-primary" onClick={()=>setImporting(!importing)}>Upload a guest or gift list</button><button onClick={()=>setImporting(true)}>Paste rows</button><button onClick={newRow}>Add a household</button></div>
 {importing&&<section className="wed-panel"><WeddingListImport onApply={apply} headers={authHeaders} onClose={()=>setImporting(false)}/></section>}
 <details><summary>Add from your saved contacts</summary>{user?<><label>Contact<select value={contact} onChange={e=>setContact(e.target.value)}><option value="">Choose a saved address</option>{account?.savedAddresses?.map(a=><option key={a.id} value={a.id}>{[a.firstName,a.lastName].join(" ")} · {a.city}</option>)}</select></label><button disabled={!contact} onClick={()=>{const a=account?.savedAddresses?.find(a=>a.id===contact);if(!a)return;newRow();setPrefill({...newWeddingHousehold("new"),envelopeName:[a.firstName,a.lastName].filter(Boolean).join(" "),insideName:a.firstName,firstName:a.firstName,lastName:a.lastName,address:{address1:a.street1,address2:a.street2||"",city:a.city,state:a.state,zip:a.zip,country:a.country||""}});}}>Review this household</button></>:<button onClick={signIn}>Sign in to use saved contacts</button>}</details>
 <div className="wed-columns"><section className="wed-panel"><h2>{state.households.length} {state.households.length===1?"household":"households"}</h2><p className="wed-meta">One envelope per household. Up to 250 draft households per project.</p><label>Find a household<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label><label><input type="checkbox" checked={issuesOnly} onChange={e=>setIssuesOnly(e.target.checked)}/>Show only households needing review</label>
 {!visible.length&&<p>{state.households.length?"No matching households.":"Add your first household, or bring a guest list."}</p>}
 <ul className="wed-list wed-scroll">{visible.map(r=><li key={r.id}><button onClick={()=>{setAdding(false);setPrefill(null);setLink("");onEdit(r.id);}}>{r.envelopeName||"Unnamed household"}</button><small> · {r.paidBatchId?"Ordered on hold":r.excluded?"Excluded":r.pendingAddress?"New address to review":weddingAddressReady(r)?"Address confirmed":"Check address"}</small></li>)}</ul></section>
 <section className="wed-note">{source||adding?<PersonForm key={source?.id||prefill?.envelopeName||"new"} row={source||prefill||newWeddingHousehold("new")} existing={!!source} mutate={mutate} onDone={()=>{setAdding(false);onEdit(null);notify("Household saved.");}}/>:<><h2>Review an envelope</h2><p>Choose a household to check their mailing address, inside names or gift.</p></>}
 {source&&!source.paidBatchId&&<><details><summary>Request their current address</summary><p>Share a private link. They can submit only their own address, and you review it before sending.</p><button onClick={()=>void work(async()=>{const r=await mutate("invite",{kind:"address",householdId:source.id});setLink(String(r.link));})}>Create address link</button>{link&&<PrivateLink link={link}/>}</details>
 {source.pendingAddress&&<div><h3>Address submitted for review</h3><pre>{formatAddress({...source,address:source.pendingAddress.address})}</pre><button onClick={()=>void work(async()=>{await mutate("acceptAddress",{id:source.id,revision:source.revision});notify("Address confirmed.");})}>Accept address</button></div>}</>}
 {error&&<p role="alert" className="wed-notice">{error}</p>}</section></div></>;
}
function PersonForm({row,existing,mutate,onDone}:{row:Person;existing:boolean;mutate:PanelProps["mutate"];onDone:()=>void}){
 const [form,setForm]=useState(()=>({...row})),[base,setBase]=useState(row.revision),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const edit=(v:Partial<Person>)=>setForm({...form,...v});
 async function save(){
   setBusy(true);setError("");try{
    const patch={envelopeName:form.envelopeName,firstName:form.firstName||form.envelopeName,lastName:form.lastName,insideName:form.insideName,insideNameConfirmed:Boolean(form.insideName.trim()),identityConfirmed:form.identityConfirmed,gift:form.gift,address:form.address,addressConfirmed:form.addressConfirmed,excluded:form.excluded};
    await mutate("saveHousehold",{...(existing?{id:row.id,revision:base}:{}),patch});onDone();
   }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
 }
 return <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy||!!row.paidBatchId}><legend>{existing?"Edit household":"Add a household"}</legend><label>Envelope name<input required value={form.envelopeName} onChange={e=>edit({envelopeName:e.target.value,identityConfirmed:false})}/></label><label>Names inside the card<input value={form.insideName} onChange={e=>edit({insideName:e.target.value})}/></label>
 <details><summary>Envelope name as printed</summary><label>First name or entire label<input value={form.firstName||form.envelopeName} onChange={e=>edit({firstName:e.target.value,identityConfirmed:false})}/></label><label>Last name (optional)<input value={form.lastName} onChange={e=>edit({lastName:e.target.value,identityConfirmed:false})}/></label></details>
 <label><input type="checkbox" checked={form.identityConfirmed} onChange={e=>edit({identityConfirmed:e.target.checked})}/>Use this exact envelope label: {[form.firstName||form.envelopeName,form.lastName].filter(Boolean).join(" ")}</label>
 <label>Gift or gesture<input value={form.gift} onChange={e=>edit({gift:e.target.value})}/></label>
 <AddressFields value={form.address||blankAddress} onChange={a=>edit({address:a,addressConfirmed:false})}/>
 <label><input type="checkbox" checked={form.addressConfirmed} onChange={e=>edit({addressConfirmed:e.target.checked})}/>I’ve reviewed the mailing address.</label>
 <label><input type="checkbox" checked={form.excluded} onChange={e=>edit({excluded:e.target.checked})}/>Exclude this card (already thanked or not sending).</label>
 {error&&<p role="alert" className="wed-notice">{error}</p>}{existing&&base!==row.revision&&<div className="wed-notice">Another edit was saved.<pre>{formatAddress(row)}</pre><button type="button" onClick={()=>{setBase(row.revision);setError("");}}>Keep my edits against this version</button></div>}
 <button className="wed-primary" type="submit">Save household</button></fieldset></form>;
}
