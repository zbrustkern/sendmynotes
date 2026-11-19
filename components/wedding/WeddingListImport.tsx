"use client";
import { useEffect, useRef, useState } from "react";
import { canonicalFields,maxWeddingFileBytes,type FieldMapping,type WeddingImportPreview,type WeddingImportRow } from "@/lib/wedding/import-contract";
import { prepareWeddingAiExcerpt } from "@/lib/wedding/ai-schema";
import { errorMessage,postWedding,weddingRequest } from "./client";

const fields = {
  sourceId:"Household ID", firstName:"First name", lastName:"Last name", additionalGuest:"Additional guest", envelopeName:"Envelope name", insideNames:"Inside names",
  street1:"Street address",street2:"Apartment or unit",city:"City",state:"State or region",zip:"Postal code",country:"Country",
  gift:"Gift",giver:"Gift giver",giftId:"Gift ID",body:"Exact note",status:"Thank-you status",
};
const editFields = ["envelopeName","insideNames","gift","body","street1","street2","city","state","zip","country"] as const;
type ExistingHousehold = {
  sourceHouseholdId?:string; envelopeName:string; insideName:string; gift:string; bodyOverride:string|null;
  address:{address1:string;address2:string;city:string;state:string;zip:string;country:string};
};
type Props={existingHouseholds?:ExistingHousehold[];onApply:(rows:WeddingImportRow[],importId:string)=>Promise<void>;onClose?:()=>void;headers?:()=>Promise<Record<string,string>>};
function proseRow(id:string,source:string):WeddingImportRow {
  return {id,source,sourceId:"",sources:[source],envelopeName:"",insideNames:"",firstName:"",lastName:"",street1:"",street2:"",city:"",state:"",zip:"",country:"",
    gift:"",body:"",alreadyThanked:false,guestCount:1,issues:["Review the envelope and address."]};
}
function rowLabel(row:WeddingImportRow) { return row.envelopeName || row.source; }
export default function WeddingListImport({onApply,onClose,existingHouseholds=[]}:Props) {
  const [file,setFile]=useState<File|null>(null),[paste,setPaste]=useState(""),[pasteFormat,setPasteFormat]=useState("tsv");
  const [preview,setPreview]=useState<WeddingImportPreview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [rows,setRows]=useState<WeddingImportRow[]>([]),[rowId,setRowId]=useState(""),[sheetNames,setSheetNames]=useState<string[]>([]);
  const [maps,setMaps]=useState<Record<string,FieldMapping>>({}),[sourceIndex,setSourceIndex]=useState<number|null>(null);
  const [excerpt,setExcerpt]=useState(""),[deferred,setDeferred]=useState<number[]>([]),[includeUS,setIncludeUS]=useState(false);
  const [assigned,setAssigned]=useState<Record<string,string>>({}),[smart,setSmart]=useState<{name:string;gift:string;memory:string}[]>([]);
  const [meta,setMeta]=useState<{provider?:string;model?:string}>({}),[consent,setConsent]=useState(false);
  const aiKeys=useRef(new Map<string,string>()), mounted=useRef(true);
  useEffect(()=>{
    mounted.current=true;
    void weddingRequest<{provider?:string;model?:string}>("ai").then(m=>mounted.current&&setMeta(m)).catch(()=>{});
    return ()=>{mounted.current=false;};
  },[]);
  const aiKey=(scope:string)=>{const existing=aiKeys.current.get(scope);if(existing)return existing;const k=crypto.randomUUID();aiKeys.current.set(scope,k);return k;};
  async function work(fn:()=>Promise<void>) {
    if(busy)return;
    setBusy(true);setError("");try {await fn();} catch(e) {setError(errorMessage(e));} finally {setBusy(false);}
  }
  function show(p:WeddingImportPreview,selected?:string[]) {
    setPreview(p);setRows(p.rows);setMaps(Object.fromEntries(p.sheets.map(s=>[s.name,s.mapping])));setSheetNames(selected || p.sheets.map(s=>s.name));
    setRowId("");setSourceIndex(null);setExcerpt("");setSmart([]);setConsent(false);setDeferred([]);setAssigned({});setIncludeUS(false);
  }
  async function upload(body:File|string,format:string) {
    if(!["csv","tsv","vcf","txt","xlsx"].includes(format)) throw Error("Choose CSV, TSV, vCard, plain text or XLSX.");
    if((typeof body==="string"?new Blob([body]).size:body.size)>maxWeddingFileBytes) throw Error("Choose a list of up to 5 MiB.");
    const p=await weddingRequest<WeddingImportPreview>("import?format="+format,{method:"POST",body,headers:{"Content-Type":"application/octet-stream"}});
    show(p);try{sessionStorage.setItem("smn-wedding-import-preview",p.importId);}catch{}
  }
  async function restore(){
    let id="";try{id=sessionStorage.getItem("smn-wedding-import-preview")||"";}catch{}
    if(!id)throw Error("No recent file preview on this device. Choose a file to start.");
    show(await weddingRequest<WeddingImportPreview>("import?id="+encodeURIComponent(id)));
  }
  function choosePassage(i:number) {
    setSourceIndex(i);setExcerpt("");setSmart([]);setConsent(false);setRowId("");
  }
  const putRow=(r:WeddingImportRow)=>{setRows(current=>current.some(x=>x.id===r.id)?current.map(x=>x.id===r.id?r:x):[...current,r]);setRowId(r.id);};
  function startManual() {
    if(sourceIndex===null)return;
    const id="prose_"+(preview?.importId.slice(0,16)||"")+"_"+sourceIndex;
    const existing=rows.find(r=>r.id===id);
    const newRow=existing || proseRow(id,"Passage "+(sourceIndex+1));
    putRow(newRow);setDeferred(d=>d.filter(n=>n!==sourceIndex));
  }
  const existingById=new Map(existingHouseholds.map(r=>[r.sourceHouseholdId,r]));
  const matches=rows.flatMap(r=>{
    const repeated=r.sourceId && rows.some(other=>other!==r && other.sourceId===r.sourceId);
    const prior=existingById.get(repeated?r.id:r.sourceId||r.id);
    if(!prior)return [];
    const changed=prior.envelopeName!==r.envelopeName || prior.insideName!==r.insideNames || prior.gift!==r.gift ||
      (prior.bodyOverride||"")!==r.body || prior.address.address1!==r.street1 || prior.address.address2!==r.street2 ||
      prior.address.city!==r.city || prior.address.state!==r.state || prior.address.zip!==r.zip || prior.address.country!==r.country;
    return [{id:r.id,name:prior.envelopeName,changed}];
  });
  const current=rows.find(r=>r.id===rowId);
  const prepared=prepareWeddingAiExcerpt(excerpt);
  const permittedSmart=Boolean(meta.provider && meta.model);
  async function apply(){
    if(!preview)return;
    let selected=rows.map(row=>({...row,firstName:row.firstName||row.envelopeName,country:row.country || (includeUS?"US":"")}));
    if(selected.some(r=>!r.envelopeName.trim()))throw Error("Give each selected household an envelope name, or leave its passage for later.");
    for(const x of preview.exceptions) {
      if (!x.gift || !assigned[x.source]) continue;
      selected=selected.map(r=>r.id===assigned[x.source]?{...r,gift:[r.gift,x.gift].filter(Boolean).join("; "),sources:[...r.sources,x.source]}:r);
    }
    // A sender may confirm a new mapping or revised selection from the same file.
    // Stable household IDs preserve prior edits. Identical reviews replay safely.
    const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(selected)));
    const version=Array.from(new Uint8Array(hash).slice(0,12),v=>v.toString(16).padStart(2,"0")).join("");
    await onApply(selected,preview.importId+"_"+version);
  }
  return <div className="wed-list-import"><h3>Bring your guest or gift list</h3>
    <fieldset disabled={busy}><label>Choose a private file<input type="file" accept=".csv,.tsv,.vcf,.xlsx,.txt" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
    <button type="button" disabled={!file} onClick={()=>file&&void work(()=>upload(file,file.name.split(".").pop()!.toLowerCase()))}>Check file</button>
    <details><summary>Paste a list instead</summary><label>Format<select value={pasteFormat} onChange={e=>setPasteFormat(e.target.value)}>
      <option value="tsv">Copied spreadsheet cells</option><option value="csv">Comma-separated list</option><option value="txt">Family notes</option></select></label>
      <label>Guest or gift list<textarea rows={4} value={paste} onChange={e=>setPaste(e.target.value)}/></label><button type="button" disabled={!paste.trim()} onClick={()=>void work(()=>upload(paste,pasteFormat))}>Check pasted list</button></details>
    {!preview&&<button type="button" onClick={()=>void work(restore)}>Reopen last file preview</button>}</fieldset>
    {busy&&<p role="status">Working on your list…</p>}
    {error&&<p role="alert" className="wed-notice">{error}</p>}
    {preview&&<fieldset disabled={busy}><legend>Review this import</legend>
      <p>{preview.counts.sourceRows} source records · {rows.length} households · at least {preview.counts.guests} guests in the structured list.</p>
      {!!matches.length&&<details open><summary>{matches.length} households are already in this project</summary>
        <p>Their saved names, notes and addresses will be kept. Open a household under Your people to make a correction.</p>
        {matches.some(m=>m.changed)&&<ul className="wed-list wed-scroll">{matches.filter(m=>m.changed).map(m=><li key={m.id}>{m.name} · incoming details differ</li>)}</ul>}</details>}
      {!!preview.sheets.length&&<details><summary>Review sheet and column matches</summary>
        {preview.sheets.map(sheet=><section key={sheet.name}><label><input type="checkbox" checked={sheetNames.includes(sheet.name)} onChange={e=>setSheetNames(s=>e.target.checked?[...s,sheet.name]:s.filter(n=>n!==sheet.name))}/>{sheet.name}</label>
          <div>{sheet.headers.map((h,i)=><label key={h}>{h}{sheet.example[i]&&<small> · {sheet.example[i].slice(0,80)}</small>}
            <select value={maps[sheet.name]?.[h]||""} onChange={e=>setMaps(m=>({...m,[sheet.name]:{...m[sheet.name],[h]:e.target.value}}) as Record<string,FieldMapping>)}>
              <option value="">Leave out</option>{canonicalFields.map(f=><option key={f} value={f}>{fields[f]}</option>)}</select></label>)}</div>
          {permittedSmart&&sheet.headers.length<=40&&<details><summary>Suggest column matches</summary><p>Send only these headings to {meta.provider} ({meta.model}) for suggested field names.</p>
            <p>{sheet.headers.join(" · ")}</p><button type="button" onClick={()=>void work(async()=>{
              const r=await postWedding<{mapping:FieldMapping}>("ai",{action:"map",headers:sheet.headers,consent:true,idempotencyKey:aiKey("headers:"+JSON.stringify(sheet.headers))});
              setMaps(m=>({...m,[sheet.name]:{...m[sheet.name],...r.mapping}}));
            })}>Share these headings for suggestions</button></details>}</section>)}
        <p>Refreshing the preview rebuilds the rows from these column matches.</p>
        <button type="button" disabled={!sheetNames.length} onClick={()=>void work(async()=>show(await postWedding<WeddingImportPreview>("import?action=map",{importId:preview.importId,mappings:maps,sheets:sheetNames}),sheetNames))}>Refresh preview</button>
      </details>}
      {!!preview.excerpts.length&&<section><h4>Family notes</h4><p>Choose one passage to work through. You can leave uncertain names or gifts for later.</p>
        <label>Passage<select value={sourceIndex??""} onChange={e=>choosePassage(Number(e.target.value))}><option value="" disabled>Choose a passage</option>
          {preview.excerpts.map((text,i)=><option key={i} value={i}>{i+1}. {text.slice(0,54)}{deferred.includes(i)?" · Later":""}</option>)}</select></label>
        {sourceIndex!==null&&<><blockquote style={{whiteSpace:"pre-wrap"}}>{preview.excerpts[sourceIndex]}</blockquote>
          <button type="button" onClick={startManual}>Enter this household myself</button>
          <button type="button" onClick={()=>{setDeferred(d=>[...new Set([...d,sourceIndex])]);setSourceIndex(null);setRowId("");}}>Leave this passage for later</button>
          {permittedSmart&&<details><summary>Get help with this passage</summary><label>Select a short excerpt to share<textarea value={excerpt} maxLength={1600} onChange={e=>{setExcerpt(e.target.value);setSmart([]);setConsent(false);}}/></label>
            <p>Copy an excerpt from this passage. Review the exact text going to {meta.provider} ({meta.model}) for name and gift suggestions.</p>
            <pre style={{whiteSpace:"pre-wrap"}}>{prepared}</pre><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Share this excerpt for suggestions</label>
            <button type="button" disabled={!consent||!prepared||!preview.excerpts[sourceIndex].includes(excerpt.trim())} onClick={()=>void work(async()=>{
              const result=await postWedding<{suggestions:{name:string;gift:string;memory:string}[]}>("ai",{action:"map",excerpt:prepared,consent:true,idempotencyKey:aiKey("excerpt:"+prepared)});
              setSmart(result.suggestions);
            })}>Suggest fields</button>
            {smart.map((s,i)=><div key={i}><p>{s.name} · {s.gift}{s.memory && " · " + s.memory}</p><button type="button" onClick={()=>{
              const id="prose_"+preview.importId.slice(0,16)+"_"+sourceIndex+"_"+i;
              const r=rows.find(x=>x.id===id)||proseRow(id,"Passage "+(sourceIndex+1));putRow({...r,envelopeName:s.name,firstName:s.name,gift:s.gift,memory:s.memory});
            }}>Use this suggestion</button></div>)}</details>}</>}
      </section>}
      {!!preview.exceptions.length&&<section><h4>Unresolved records</h4>{preview.exceptions.map((x,i)=><div key={i}><p>{x.source} · {x.reason}</p>
        {x.gift&&<label>Assign gift to<select value={assigned[x.source]||""} onChange={e=>setAssigned(a=>({...a,[x.source]:e.target.value}))}><option value="">Leave unresolved</option>
          {rows.map(r=><option key={r.id} value={r.id}>{rowLabel(r)}</option>)}</select></label>}</div>)}</section>}
      {!!rows.length&&<>
        <p>{preview.counts.missingAddresses} addresses need review · {rows.filter(r=>r.alreadyThanked).length} marked already thanked.</p>
        <label>Review a household<select value={rowId} onChange={e=>setRowId(e.target.value)}><option value="">Choose a household</option>
          {[...rows].sort((a,b)=>b.issues.length-a.issues.length).map(r=><option value={r.id} key={r.id}>{rowLabel(r)} · {r.source}{r.issues.length?" · review":""}</option>)}</select></label>
        {current&&<section><p>{current.sources.join(", ")}{current.issues.length?" · "+current.issues.join(" "):""}</p>
          {editFields.map(f=><label key={f}>{fields[f]}{f==="body"?<textarea value={current[f]} onChange={e=>putRow({...current,[f]:e.target.value})}/>:<input value={current[f]} onChange={e=>{
            const value=e.target.value;putRow(f==="envelopeName"?{...current,envelopeName:value,firstName:value,lastName:""}:{...current,[f]:value});
          }}/>}</label>)}<label><input type="checkbox" checked={current.alreadyThanked} onChange={e=>putRow({...current,alreadyThanked:e.target.checked})}/>Already thanked · exclude from sending</label>
          <button type="button" onClick={()=>{setRows(rs=>rs.filter(r=>r.id!==current.id));setRowId("");}}>Leave this household out</button></section>}
        {rows.some(r=>!r.country)&&<label><input type="checkbox" checked={includeUS} onChange={e=>setIncludeUS(e.target.checked)}/>Use United States for rows without a country</label>}
        <button type="button" className="wed-primary" disabled={rows.length>250} onClick={()=>void work(apply)}>Confirm and add {rows.length} household{rows.length===1?"":"s"}</button>
        {rows.length>250&&<p>Split this list or leave households out to fit the 250-household project limit.</p>}
      </>}
    </fieldset>}
    {onClose&&<button type="button" disabled={busy} onClick={onClose}>Close import</button>}
  </div>;
}
