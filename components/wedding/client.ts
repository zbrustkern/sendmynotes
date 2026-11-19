import { getFirebaseAuth } from "@/lib/firebase-client";

import { blankWeddingAddress, resolveWeddingNote, weddingResolvedFields, weddingApprovalFingerprint, weddingRowReady, type WeddingHousehold, type WeddingProject, type WeddingActor, type WeddingAddress, type WeddingCover, type WeddingReturnAddress, type WeddingTemplate } from "@/lib/wedding/domain";
export type Project = WeddingProject;
export type Person = WeddingHousehold;
export type Actor = WeddingActor;
export type Address = WeddingAddress;
export type Cover = WeddingCover;
export type Sender = WeddingReturnAddress;
export type Template = WeddingTemplate;
export type Member = {id:string;actorId?:string;role:string;canExport:boolean;canPay:boolean;revoked:boolean;label?:string};
export type Snapshot = {project:Project;households:Person[];actor:Actor;members?:Member[];sessions?:{sessionId:string;actorId:string;current?:boolean;revoked?:boolean}[];invites?:{inviteId:string;kind:string;expiresAt:number}[]};
export type Action = (action:string, payload?:Record<string,unknown>)=>Promise<Record<string,unknown>>;
export type PanelProps = {state:Snapshot;mutate:Action;refresh:()=>Promise<void>;notify:(message:string)=>void;signIn:()=>void};
export const blankAddress = blankWeddingAddress();
export const dollars = (cents:number)=>Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
export const noteFor = resolveWeddingNote;
export const isReady = weddingRowReady;
export const resolved = weddingResolvedFields;
export const isApproved = (p:Project,h:Person)=>h.approvedFingerprint===weddingApprovalFingerprint(p,h);
export function formatAddress(row:{envelopeName:string;address:Address}) {
 const a=row.address||blankAddress;
 return [row.envelopeName,a.address1,a.address2,[a.city,a.state,a.zip].filter(Boolean).join(" "),a.country].filter(Boolean).join("\n");
}
export async function authHeaders():Promise<Record<string,string>> {
 let user; try{user=getFirebaseAuth().currentUser;}catch{return {};}
 return user ? {Authorization:"Bearer "+await user.getIdToken()} : {};
}
export class WeddingRequestError extends Error {
 constructor(message:string,readonly status:number,readonly code?:string){super(message);}
}
export async function weddingRequest<T>(path:string,init:RequestInit={}):Promise<T>{
 const headers=new Headers(init.headers);for(const [k,v] of Object.entries(await authHeaders())) headers.set(k,v);
 const res=await fetch("/api/wedding/"+path,{credentials:"same-origin",cache:"no-store",...init,headers});
 const data=await res.json().catch(()=>({}));
 if(!res.ok) throw new WeddingRequestError(typeof data.error==="string"?data.error:"This request could not be completed. Try again.",res.status,data.code);
 return data as T;
}
export function postWedding<T>(path:string,body:Record<string,unknown>){return weddingRequest<T>(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});}
export const errorMessage = (e:unknown)=>e instanceof Error ? e.message : "Please try again.";
export function safePreview(url:string|undefined){return typeof url==="string" && /^\/(?:presets\/[^/?#]+\.(?:jpg|png|webp)|api\/wedding\/artwork\?id=[\w-]+)$/.test(url) ? url : "/presets/thank-you-botanical.jpg";}
