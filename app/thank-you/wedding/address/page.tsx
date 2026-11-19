"use client";
import {useEffect,useRef,useState} from "react";
import {AddressFields} from "@/components/wedding/AddressFields";
import {blankAddress,errorMessage,postWedding,weddingRequest} from "@/components/wedding/client";
export default function AddressRequestPage(){
 const [address,setAddress]=useState({...blankAddress}),[ready,setReady]=useState(false),[sent,setSent]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const exchanged=useRef(false);
 useEffect(()=>{if(exchanged.current)return;exchanged.current=true;const token=new URLSearchParams(location.hash.slice(1)).get("address");if(location.hash)history.replaceState(null,"",location.pathname);
 const req=token?postWedding<{submitted:boolean}>("address",{action:"redeem",token}):weddingRequest<{submitted:boolean}>("address");
 req.then(r=>{setReady(true);setSent(r.submitted);}).catch(e=>setError(errorMessage(e)));},[]);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{await postWedding("address",{action:"submit",address});setSent(true);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <main className="wed"><header className="wed-top"><span>SendMyNotes</span></header><section className="wed-panel"><h1>{sent?"Address received":"Your mailing address"}</h1>{sent?<p>Your address is ready for the sender to review.</p>:ready?<form onSubmit={submit}><p>Let the sender know where to mail your thank-you card.</p><AddressFields value={address} onChange={setAddress}/><button className="wed-primary" disabled={busy||!address.address1||!address.city||!address.country}>Submit my address for review</button></form>:!error&&<p role="status">Opening your private form…</p>}{error&&<p role="alert">{error}</p>}</section></main>;
}
