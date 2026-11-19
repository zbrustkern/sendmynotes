"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {errorMessage,WeddingRequestError} from "./client";

/** Each mounted editor owns one row. A save always carries the revision the writer saw. */
export function useWeddingDraft<T extends object>(initial:T,revision:number,save:(value:T,base:number)=>Promise<number>){
 const [value,setValue]=useState(initial);
 const [status,setStatus]=useState<"saved"|"dirty"|"saving"|"error"|"conflict">("saved");
 const [error,setError]=useState("");
 const dirty=useRef(false),base=useRef(revision),generation=useRef(0);
 const local=useRef(initial), server=useRef({initial,revision}),callback=useRef(save);
 const inFlight=useRef<Promise<boolean>|null>(null);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),mounted=useRef(true);
 server.current={initial,revision};callback.current=save;
 useEffect(()=>{if(!dirty.current){base.current=revision;local.current=server.current.initial;setValue(server.current.initial);}},[revision]);
 const flush=useCallback(async function submit():Promise<boolean>{
   if(timer.current)clearTimeout(timer.current);
   if(inFlight.current){const success=await inFlight.current;return success && (!dirty.current || submit());}
   if(!dirty.current)return true;
   const seq=generation.current,oldBase=base.current,current=local.current;
   setStatus("saving");
   const promise=(async()=>{try{
     const next=await callback.current(current,oldBase);base.current=next;
     dirty.current=seq!==generation.current;
     if(mounted.current){setStatus(dirty.current?"dirty":"saved");setError("");}
     return true;
   }catch(e){if(mounted.current){setError(errorMessage(e));setStatus(e instanceof WeddingRequestError && e.status===409?"conflict":"error");}return false;}
   finally{inFlight.current=null;}})();
   inFlight.current=promise;return promise;
 },[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(timer.current)clearTimeout(timer.current);};},[]);
 useEffect(()=>{if(status!=="dirty")return;timer.current=setTimeout(()=>{void flush();},900);return()=>{if(timer.current)clearTimeout(timer.current);};},[status,value,flush]);
 useEffect(()=>{const prevent=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent);},[]);
 const update=(next:T)=>{dirty.current=true;generation.current++;local.current=next;setValue(next);if(status!=="conflict")setStatus("dirty");};
 return {value,update,flush,dirty:dirty.current,status,error,server:server.current.initial,
   useTheirs:()=>{dirty.current=false;base.current=server.current.revision;local.current=server.current.initial;setValue(server.current.initial);setStatus("saved");setError("");},
   keepMine:()=>{base.current=server.current.revision;setStatus("dirty");setError("");}};
}
type SaveState={status:string;error:string;flush:()=>Promise<boolean>;useTheirs:()=>void;keepMine:()=>void};
export function SaveStatus({draft,other}:{draft:SaveState;other?:React.ReactNode}){
 if(draft.status==="conflict")return <div role="alert" className="wed-notice"><strong>Another writer saved a change.</strong><p>Your edits are still in these fields. The current saved version follows.</p>{other}<div className="wed-actions"><button onClick={draft.keepMine}>Save my version</button><button onClick={draft.useTheirs}>Use the saved version</button></div></div>;
 if(draft.status==="error")return <div role="alert" className="wed-notice">{draft.error} <button onClick={()=>void draft.flush()}>Retry save</button></div>;
 return <p role="status" className="wed-meta">{draft.status==="saved"?"Saved":draft.status==="dirty"?"Unsaved changes":"Saving…"}</p>;
}
