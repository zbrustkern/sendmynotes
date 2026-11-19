"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {flushSync} from "react-dom";
import {AuthModal} from "@/components/AuthModal";
import {useAuth} from "@/context/AuthContext";
import {CardPanel} from "./CardPanel";
import {PeoplePanel} from "./PeoplePanel";
import {WritingPanel} from "./WritingPanel";
import {Rates,ReviewPanel} from "./ReviewPanel";
import {SharingPanel} from "./SharingPanel";
import {errorMessage,postWedding,weddingRequest,WeddingRequestError,type Snapshot} from "./client";

const tabs=["Your card","Your people","Your words","Review & send"] as const;
type APIResult=Record<string,unknown>&Partial<Snapshot>;
export function WeddingWorkspace(){
 const [state,setState]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[step,setStep]=useState(0),[auth,setAuth]=useState(false),[editId,setEditId]=useState<string|null>(null),[newStart,setNewStart]=useState(false),[estimate,setEstimate]=useState("100"),[intl,setIntl]=useState("0");
 const {loading:authLoading}=useAuth();
 const mounted=useRef(true),initialized=useRef(false),fragment=useRef<string|null>(null);
 const heading=useRef<HTMLHeadingElement>(null);const flushers=useRef(new Set<()=>Promise<boolean>>());
 const registerFlush=useCallback((cb:()=>Promise<boolean>)=>{flushers.current.add(cb);return()=>{flushers.current.delete(cb);};},[]);
 const apply=useCallback((data:APIResult)=>{if(data.project&&data.households&&data.actor&&mounted.current){flushSync(()=>setState(data as Snapshot));}},[]);
 const refresh=useCallback(async()=>{const data=await weddingRequest<Snapshot>("project");apply(data);},[apply]);
 const mutate=useCallback(async(action:string,payload:Record<string,unknown>={})=>{
   try{const data=await postWedding<APIResult>("project",{action,...payload});apply(data);return data;}
   catch(e){if(e instanceof WeddingRequestError&&e.status===409){await refresh().catch(()=>{});}throw e;}
 },[apply,refresh]);
 const navigate=useCallback(async(n:number)=>{for(const flush of flushers.current)if(!await flush())return;setStep(n);try{if(state)sessionStorage.setItem("wed-step-"+state.project.id,String(n));}catch{}requestAnimationFrame(()=>heading.current?.focus());},[state]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
   if(initialized.current||authLoading)return;initialized.current=true;
   const hash=new URLSearchParams(location.hash.slice(1)),token=hash.get("wedding"),params=new URLSearchParams(location.search),paymentReturn=params.get("return")==="payment";
   if(location.hash||paymentReturn)history.replaceState(null,"",location.pathname);
   fragment.current=token;
   void(async()=>{try{
    let data:Snapshot;
    if(token){try{data=await postWedding<Snapshot>("project",{action:"redeem",token});fragment.current=null;}
      catch(e){if(e instanceof WeddingRequestError&&e.code==="project_required"){setNotice("Choose Start my thank-yous to apply this tester invitation to your new project.");return;}throw e;}}
    else data=await weddingRequest<Snapshot>("project");
    apply(data);let initial=0;try{initial=Number(sessionStorage.getItem("wed-step-"+data.project.id))||0;}catch{}setStep(paymentReturn||data.project.activeBatchId?3:Math.max(0,Math.min(3,initial)));
   }catch(e){if(!(e instanceof WeddingRequestError&&[401,404].includes(e.status)))setError(errorMessage(e));}
   finally{if(mounted.current)setLoading(false);}})();
 },[apply,authLoading]);
 async function start(sample:boolean){setBusy(true);setError("");try{const d=await mutate("create",{sample,new:newStart});if(fragment.current){await mutate("redeem",{token:fragment.current});fragment.current=null;}setStep(sample?1:0);setNewStart(false);setNotice(sample?"This is a private project with 100 fictional households.":"Your private project is ready.");if(!d.project)await refresh();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 async function finishSignIn(){setAuth(false);try{if(state){await mutate("claim");setNotice("Account linked. Resume the operation when you’re ready.");}}catch(e){setError(errorMessage(e));}}
 const props=state?{state,mutate,refresh,notify:setNotice,signIn:()=>setAuth(true)}:null;
 const synthetic=state?.households.every(r=>r.id.startsWith("sample_"))&&state.households.length>0;
 const validEstimate=/^\d{1,3}$/.test(estimate)&&+estimate>=1&&+estimate<=250&&/^\d{1,3}$/.test(intl)&&+intl<=+estimate;
 return <main className="wed"><header className="wed-top"><Link href="/">SendMyNotes</Link><span>Wedding thank-you notes</span></header>
 {loading?<p className="wed-notice" role="status">Opening your wedding project…</p>:!state||newStart?<><section className="wed-landing"><div><h1>Your wedding<br/>thank-you notes.</h1><p>Start with your photo and guest list. Write once for a group, or give someone their own words. Each envelope gets its own handwritten card.</p>
 <div className="wed-actions"><button className="wed-primary" onClick={()=>void start(false)} disabled={busy}>Start my thank-yous</button><button onClick={()=>void start(true)} disabled={busy}>Try a sample list</button>{state&&<button onClick={()=>setNewStart(false)}>Back to my project</button>}</div><p className="wed-meta">The sample uses 100 fictional households. Staging purchases use test payments and stay on hold.</p></div><img src="/presets/thank-you-laurel-wreath.jpg" alt="Olive and laurel thank-you card" className="wed-hero-card"/></section>
 <details className="wed-panel"><summary>Estimate the price of your cards</summary><div className="wed-mini-grid"><label>Envelopes in your project<input type="number" min="1" max="250" value={estimate} onChange={e=>setEstimate(e.target.value)}/></label><label>International envelopes<input type="number" min="0" max={estimate} value={intl} onChange={e=>setIntl(e.target.value)}/></label></div>{validEstimate?<Rates selected={+estimate} international={+intl}/>:<p>Use 1–250 whole envelopes and include international cards in that total.</p>}</details></>:props&&<>
 <h1 tabIndex={-1} ref={heading}>{tabs[step]}</h1><nav className="wed-steps" aria-label="Wedding project steps">{tabs.map((name,i)=><button key={name} aria-current={step===i?"step":undefined} onClick={()=>void navigate(i)}>{name}</button>)}</nav>
 {synthetic&&<p className="wed-notice">You’re working with the sample households. <button onClick={()=>setNewStart(true)}>Start my own project</button></p>}
 {step===0&&<CardPanel {...props} registerFlush={registerFlush}/>}
 {step===1&&<PeoplePanel {...props} editId={editId} onEdit={setEditId}/>}
 {step===2&&<WritingPanel {...props} registerFlush={registerFlush}/>}
 {step===3&&<ReviewPanel {...props}/>}
 {step<3&&<div className="wed-actions"><button className="wed-primary" onClick={()=>void navigate(step+1)}>Continue to {tabs[step+1].toLowerCase()}</button></div>}
 <SharingPanel {...props}/></>}
 {error&&<p role="alert" className="wed-notice">{error} <button onClick={()=>void refresh().then(()=>setError("")).catch(e=>setError(errorMessage(e)))}>Retry</button></p>}{notice&&<p role="status" className="wed-notice">{notice}</p>}
 {auth&&<AuthModal isOpen={auth} onClose={()=>setAuth(false)} onSuccess={()=>void finishSignIn()} title="Sign in to your wedding project" subtitle="Your project stays saved while you verify your account."/>}</main>;
}
