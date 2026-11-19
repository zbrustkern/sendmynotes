"use client";
import {useState} from "react";
import type {DraftState} from "@/lib/draft/types";
import {previousCheckoutProof} from "@/lib/checkout-draft-client";
import {authHeaders,errorMessage} from "./client";
export function markWeddingTransferAttempt(checkoutId:string){try{sessionStorage.setItem("smn-multi-payment-attempted-"+checkoutId,"1");}catch{}}
export function TransferToWedding({draft,proof,disabled,editing}:{draft:DraftState;proof?:{orderId:string;viewToken:string};disabled:boolean;editing:()=>boolean}){
 const [expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[status,setStatus]=useState(""),[cover,setCover]=useState(false),[replacement,setReplacement]=useState(false);
 if(!draft.multiSend)return null;
 async function transfer(){
   if(!draft.multiSend)return;if(editing()){setError("Save or cancel the open recipient edit first.");return;}
   const previousCheckout=proof||previousCheckoutProof();let attempted=!!previousCheckout;
   try{attempted ||= sessionStorage.getItem("smn-multi-payment-attempted-"+draft.multiSend.checkoutId)==="1";}catch{attempted=true;}
   setBusy(true);setError("");try{
     const response=await fetch("/api/wedding/transfer",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json",...await authHeaders()},body:JSON.stringify({draft,previousCheckout,paymentAttempted:attempted,...(replacement?{coverResolution:{presetId:"preset-thankyou-botanical"}}:{})})});
     const data=await response.json();
     if(!response.ok){if(data.code==="TRANSFER_ORDER_STATUS"&&typeof data.orderPath==="string"&&/^\/order\/[\w-]+\?/.test(data.orderPath))setStatus(data.orderPath);if(data.code==="TRANSFER_COVER_RESOLUTION_REQUIRED")setCover(true);throw new Error(data.error||"Your batch could not be transferred.");}
     if(data.transferred&&data.projectPath==="/thank-you/wedding")location.assign(data.projectPath);else throw Error("The transfer did not return a wedding project.");
   }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
 }
 return <section className="my-3 rounded-xl border border-stone-200 bg-white p-4 text-sm"><button type="button" className="font-semibold underline" disabled={disabled} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>Continue as a thank-you project</button>
 {expanded&&<><p className="my-2">Bring {draft.multiSend.recipients.length} recipients, their greetings, your card, handwriting, shared wording and return address into a private project. Your original draft stays available.</p>
 {cover&&<label className="my-2 block"><input type="checkbox" checked={replacement} onChange={e=>setReplacement(e.target.checked)}/> Choose the botanical cover for the project. I can choose or upload a different front there.</label>}
 <button className="rounded-lg bg-emerald-900 px-3 py-2 text-white" type="button" disabled={disabled||busy||!!status||cover&&!replacement} onClick={()=>void transfer()}>Copy my batch into a wedding project</button></>}
 {error&&<p role="alert">{error}</p>}{status&&<a href={status} className="underline">View existing order status</a>}</section>;
}
