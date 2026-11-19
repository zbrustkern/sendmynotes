"use client";
import {useState,useEffect,useRef} from "react";
import {weddingWordingIssues,weddingAddressReady,weddingOverflow} from "@/lib/wedding/domain";
import {errorMessage,isApproved,isReady,noteFor,resolved,type Person,type Project,type PanelProps} from "./client";
import {handFont} from "./CardPanel";
import {SaveStatus,useWeddingDraft} from "./useWeddingDraft";
import {DraftAssistant} from "./DraftAssistant";

const filters=["All","Needs review","Missing gift","Cash gift","Personalized","Waiting for address","Ready"] as const;
type Filter=typeof filters[number];
function match(filter:Filter,p:Project,r:Person){switch(filter){case "Needs review":return !isApproved(p,r);case "Missing gift":return !r.gift.trim();case "Cash gift":return /\b(cash|check|cheque|money)\b/i.test(r.gift);case "Personalized":return r.bodyOverride!==null||r.signOffOverride!==null||r.greeting!==null;case "Waiting for address":return !weddingAddressReady(r);case "Ready":return isReady(p,r);default:return true;}}
type WritingProps=PanelProps&{registerFlush:(cb:()=>Promise<boolean>)=>()=>void};
export function WritingPanel(props:WritingProps){
 const {state:{project:p,households},mutate,notify,registerFlush}=props;
 const cursorKey="wed-cursor-"+p.id;
 const [current,setCurrent]=useState(()=>{try{return sessionStorage.getItem(cursorKey)||"";}catch{return "";}}),[filter,setFilter]=useState<Filter>(()=>{try{return filters.find(f=>f===sessionStorage.getItem(cursorKey+"-filter"))||"All";}catch{return "All";}});
 const [query,setQuery]=useState(""),[template,setTemplate]=useState(""),[selected,setSelected]=useState<Set<string>>(new Set()),[preview,setPreview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[count,setCount]=useState(0),[last,setLast]=useState<string|null>(null);
 const [mode,setMode]=useState(p.writingMode||"shared"),[newName,setNewName]=useState(""),[lastAssignment,setLastAssignment]=useState<{id:string;previous:string|null}[]>([]);
 const [showAI,setShowAI]=useState(false),[suggestions,setSuggestions]=useState<Record<string,string>>({});
 const rowFlush=useRef<()=>Promise<boolean>>(async()=>true);
 const latest=useRef(props.state);latest.current=props.state;
 const group=p.templates.find(t=>t.id===template);
 const inherited={body:group?.body??p.sharedBody,signOff:group?.signOff??p.signOff};
 const [overflowAllow,setOverflowAllow]=useState("");
 const shared=useWeddingDraft(inherited,p.revision,async(value,revision)=>{
   const patch=group?{templates:p.templates.map(t=>t.id===group.id?{...t,...value}:t)}:{sharedBody:value.body,signOff:value.signOff};
   const over=weddingOverflow({...p,...patch},households);
   if(over.length&&overflowAllow!==JSON.stringify(value))throw new Error("Review the cards over the writing limit before saving this wording.");
   const r=await mutate("saveProject",{revision,patch});return (r.project as Project).revision;
 });
 const [previousTemplate,setPreviousTemplate]=useState(template);
 // Template switching is an explicit editor transition even when the project revision is unchanged.
 useEffect(()=>{if(previousTemplate!==template){shared.useTheirs();setPreviousTemplate(template);}},[template,previousTemplate,shared]);
 useEffect(()=>registerFlush(async()=>await shared.flush()&&await rowFlush.current()),[registerFlush,shared.flush]);
 const visible=households.filter(r=>!r.excluded&&!r.paidBatchId&&match(filter,p,r)&&[r.envelopeName,r.gift,r.insideName].join(" ").toLowerCase().includes(query.toLowerCase()));
 const person=visible.find(r=>r.id===current)||visible[0];
 const selectedRows=visible.filter(r=>selected.has(r.id));
 const eligible=selectedRows.filter(r=>r.templateId===(template||null)&&r.bodyOverride===null&&r.signOffOverride===null&&weddingWordingIssues(p,r).length===0);
 const over=weddingOverflow({...p,...(group?{templates:p.templates.map(t=>t.id===group.id?{...t,...shared.value}:t)}:{sharedBody:shared.value.body,signOff:shared.value.signOff})},households);
 const progress=households.filter(r=>isApproved(p,r)).length;
 const goto=(id:string)=>{setCurrent(id);try{sessionStorage.setItem(cursorKey,id);}catch{}};
 const work=async(fn:()=>Promise<void>)=>{setBusy(true);setError("");try{await fn();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
 async function changeMode(m:"individual"|"shared"){if(!(await shared.flush())||!(await rowFlush.current()))return;await mutate("saveProject",{revision:latest.current.project.revision,patch:{writingMode:m}});setMode(m);}
 async function approve(row:Person){
   if(!await rowFlush.current())return;
   const active=latest.current.households.find(r=>r.id===row.id)||row;
   await mutate("approve",{ids:[active.id],revisions:{[active.id]:active.revision},projectRevision:latest.current.project.revision,mode:"individual"});
   setLast(active.id);setCount(c=>c+1);notify("Approved "+active.envelopeName+"’s card.");
   const others=visible.filter(r=>r.id!==active.id&&!isApproved(p,r));if(others[0])goto(others[0].id);
 }
 async function assign(tid:string|null){
   const previous=selectedRows.map(r=>({id:r.id,previous:r.templateId}));
   await mutate("assignTemplate",{ids:selectedRows.map(r=>r.id),revisions:Object.fromEntries(selectedRows.map(r=>[r.id,r.revision])),templateId:tid});
   setLastAssignment(previous);notify("Wording assigned to "+previous.length+" households.");
 }
 return <><div className="wed-progress"><strong>{progress} of {households.length} notes approved</strong><span>{households.filter(r=>isReady(p,r)).length} ready to send</span></div>
 <div className="wed-actions"><button aria-pressed={mode==="shared"} onClick={()=>void work(()=>changeMode("shared"))}>Use one note with everyone’s names</button><button aria-pressed={mode==="individual"} onClick={()=>void work(()=>changeMode("individual"))}>Write individual notes</button></div>
 <div className="wed-columns"><section className="wed-panel"><h2>{mode==="shared"?"Your shared wording":"Your writing list"}</h2>
 {mode==="shared"&&<><label>Wording template<select value={template} onChange={async e=>{const v=e.target.value;if(await shared.flush()){setTemplate(v);setPreview(false);}}}><option value="">Shared wedding note</option>{p.templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <label>Your shared note<textarea aria-label="Your shared note" rows={4} value={shared.value.body} onChange={e=>{setPreview(false);shared.update({...shared.value,body:e.target.value});}}/></label><label>Sign-off<textarea aria-label="Sign-off" rows={2} value={shared.value.signOff} onChange={e=>{setPreview(false);shared.update({...shared.value,signOff:e.target.value});}}/></label>
 {over.length>0&&shared.dirty&&<div className="wed-notice"><strong>{over.length} cards would exceed 450 characters</strong><ul>{over.map(r=><li key={r.id}>{r.envelopeName} · {r.units}/450</li>)}</ul><button onClick={()=>{setOverflowAllow(JSON.stringify(shared.value));shared.update({...shared.value});}}>Keep wording and review these cards</button></div>}
 <SaveStatus draft={shared} other={<pre className="wed-letter">{shared.server.body+"\n\n"+shared.server.signOff}</pre>}/>
 {p.templates.length<4&&<details><summary>Create another shared template</summary><label>Template name<input maxLength={50} value={newName} onChange={e=>setNewName(e.target.value)}/></label><button disabled={!newName.trim()||busy} onClick={()=>void work(async()=>{if(!await shared.flush())return;await mutate("saveProject",{revision:latest.current.project.revision,patch:{templates:[...latest.current.project.templates,{id:crypto.randomUUID(),name:newName.trim(),body:shared.value.body,signOff:shared.value.signOff,revision:1}]}});setNewName("");})}>Create template</button></details>}</>}
 <label>Search households<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Show households<select value={filter} onChange={async e=>{const v=e.target.value as Filter;if(await rowFlush.current()){setFilter(v);try{sessionStorage.setItem(cursorKey+"-filter",v);}catch{}}}}>{filters.map(f=><option key={f}>{f}</option>)}</select></label>
 <div className="wed-actions"><button onClick={()=>{setSelected(new Set(visible.map(r=>r.id)));setPreview(false);}}>Select {visible.length} shown</button><button onClick={()=>{setSelected(new Set());setPreview(false);}}>Clear selection</button></div>
 <ul className="wed-list wed-scroll">{visible.map(r=><li key={r.id}><label><input type="checkbox" checked={selected.has(r.id)} onChange={e=>{const set=new Set(selected);if(e.target.checked)set.add(r.id);else set.delete(r.id);setSelected(set);setPreview(false);}}/>{r.envelopeName}{isApproved(p,r)?" · approved":""}</label></li>)}</ul>
 {mode==="shared"&&<><div className="wed-actions"><button disabled={!selectedRows.length||busy} onClick={()=>void work(async()=>{if(await shared.flush())setPreview(true);})}>Review selected shared notes</button>{p.templates.length>0&&<button disabled={busy||!selectedRows.length} onClick={()=>void work(()=>assign(template||null))}>Assign this template to selected households</button>}{lastAssignment.length>0&&<button disabled={busy} onClick={()=>void work(async()=>{for(const previous of new Set(lastAssignment.map(a=>a.previous))){const group=lastAssignment.filter(a=>a.previous===previous);const rows=latest.current.households.filter(h=>group.some(a=>a.id===h.id));await mutate("assignTemplate",{ids:rows.map(r=>r.id),revisions:Object.fromEntries(rows.map(r=>[r.id,r.revision])),templateId:previous});}setLastAssignment([]);})}>Undo template assignment</button>}</div>
 {preview&&<section className="wed-notice"><h3>Approve the shared note</h3><pre className="wed-letter">{inherited.body+"\n\n"+inherited.signOff}</pre><p>{eligible.length} included · {selectedRows.length-eligible.length} held for separate review.</p><ul className="wed-list wed-scroll">{eligible.map(r=><li key={r.id}><button onClick={()=>goto(r.id)}>{r.envelopeName}</button> {resolved(p,r).greeting||"(No greeting)"}</li>)}</ul><button className="wed-primary" disabled={!eligible.length||busy} onClick={()=>void work(async()=>{await mutate("approve",{ids:eligible.map(r=>r.id),revisions:Object.fromEntries(eligible.map(r=>[r.id,r.revision])),projectRevision:p.revision,mode:"shared"});setPreview(false);notify("Shared notes approved.");})}>Approve shared note for {eligible.length} selected households</button></section>}</>}
 <div className="wed-actions"><button disabled={!person&&!selected.size} onClick={()=>setShowAI(!showAI)}>Help me draft</button></div>
 {showAI&&<DraftAssistant {...props} ids={selectedRows.length?selectedRows.filter(r=>r.bodyOverride===null).map(r=>r.id).slice(0,100):person?[person.id]:[]} onSuggestions={items=>setSuggestions(Object.fromEntries(items.map(s=>[s.id,s.text])))}/>}</section>
 <section className="wed-note"><h2>Personalize this card</h2>{person?<><label>Household<select value={person.id} onChange={async e=>{const id=e.target.value;if(await rowFlush.current())goto(id);}}>{visible.map(r=><option value={r.id} key={r.id}>{r.envelopeName}</option>)}</select></label><RowWriter key={person.id} {...props} row={person} register={cb=>{rowFlush.current=cb;}} onApprove={()=>work(()=>approve(person))} busy={busy} suggestion={suggestions[person.id]} onAcceptSuggestion={()=>setSuggestions(s=>{const n={...s};delete n[person.id];return n;})}/>
 <div className="wed-actions"><button disabled={visible.length<2} onClick={()=>void work(async()=>{if(await rowFlush.current())goto(visible[(visible.indexOf(person)+1)%visible.length].id);})}>Later</button>
 {last&&<button onClick={()=>void work(async()=>{const r=latest.current.households.find(h=>h.id===last);if(r){await mutate("undoApproval",{id:r.id,ids:[r.id],revision:r.revision,revisions:{[r.id]:r.revision}});goto(r.id);setLast(null);setCount(c=>Math.max(0,c-1));}})}>Undo approval</button>}</div>
 {count>0&&count%10===0&&<p role="status">That’s a set of ten. Your approved cards are saved for later.</p>}</>:<p>Add a household or choose a different filter to write a card.</p>}</section></div>{error&&<p role="alert" className="wed-notice">{error}</p>}</>;
}
function RowWriter({state:{project:p},row,mutate,register,onApprove,busy,suggestion,onAcceptSuggestion}:PanelProps & {row:Person;register:(cb:()=>Promise<boolean>)=>void;onApprove:()=>Promise<void>;busy:boolean;suggestion?:string;onAcceptSuggestion:()=>void}) {
 const [personal,setPersonal]=useState(row.bodyOverride!==null),[restore,setRestore]=useState(false);
 const draft=useWeddingDraft({greeting:row.greeting,bodyOverride:row.bodyOverride,signOffOverride:row.signOffOverride,memory:row.memory},row.revision,async(patch,revision)=>{
   const r=await mutate("saveHousehold",{id:row.id,revision,patch});return (r.households as Person[]).find(h=>h.id===row.id)!.revision;
 });
 useEffect(()=>{register(draft.flush);return()=>register(async()=>true);},[draft.flush,register]);
 const view={...row,...draft.value},fields=resolved(p,view),note=noteFor(p,view),issues=weddingWordingIssues(p,view);
 return <><h3>{row.envelopeName}</h3><p>{row.gift?"Gift: "+row.gift:"No gift listed."} {weddingAddressReady(row)?"Address confirmed.":"You can write while waiting for an address."}</p>
 <label>A detail you remember<textarea rows={2} value={draft.value.memory} onChange={e=>draft.update({...draft.value,memory:e.target.value})}/></label>
 <label>Greeting<select value={draft.value.greeting===null?"names":draft.value.greeting===""?"none":"custom"} onChange={e=>draft.update({...draft.value,greeting:e.target.value==="names"?null:e.target.value==="none"?"":fields.greeting||"Dear friends,"})}><option value="names">Use confirmed inside names</option><option value="custom">Write a greeting</option><option value="none">Leave greeting blank</option></select></label>
 {draft.value.greeting!==null&&draft.value.greeting!==""&&<label>Inside greeting<input value={draft.value.greeting} onChange={e=>draft.update({...draft.value,greeting:e.target.value})}/></label>}
 {!personal&&draft.value.bodyOverride===null?<button onClick={()=>setPersonal(true)}>Write personal wording</button>:<><label>Your words<textarea aria-label="Your words" rows={4} value={fields.body} onChange={e=>draft.update({...draft.value,bodyOverride:e.target.value})}/></label><label>Personal sign-off<textarea rows={2} value={fields.signOff} onChange={e=>draft.update({...draft.value,signOffOverride:e.target.value})}/></label><button onClick={()=>setRestore(true)}>Use shared wording again</button>{restore&&<div className="wed-notice"><p>This replaces the personal body and sign-off with:</p><pre className="wed-letter">{resolved(p,{...row,bodyOverride:null,signOffOverride:null}).body+"\n"+resolved(p,{...row,bodyOverride:null,signOffOverride:null}).signOff}</pre><button onClick={()=>{draft.update({...draft.value,bodyOverride:null,signOffOverride:null});setRestore(false);setPersonal(false);}}>Replace my wording</button><button onClick={()=>setRestore(false)}>Keep my wording</button></div>}</>}
 <p className="wed-meta">{draft.value.bodyOverride===null?"Body uses shared wording":"Personal body"} · {draft.value.signOffOverride===null?"Shared sign-off":"Personal sign-off"}</p>
 {suggestion&&<div className="wed-notice"><h3>Suggested body</h3><pre className="wed-letter">{suggestion}</pre><button onClick={()=>{draft.update({...draft.value,bodyOverride:suggestion});setPersonal(true);onAcceptSuggestion();}}>Use these words for this card</button></div>}
 <SaveStatus draft={draft} other={<pre className="wed-letter">{noteFor(p,{...row,...draft.server})}</pre>}/><pre className="wed-letter" style={{fontFamily:handFont(p.handwriting)}}>{note||"Your finished note will appear here."}</pre><p className="wed-meta">{note.length}/450 characters</p>
 {issues.length>0&&<p>{issues.join(" ")}</p>}<button className="wed-primary" disabled={busy||!!issues.length} onClick={()=>void onApprove()}>Approve &amp; next</button></>;
}
