import { NextRequest } from 'next/server';
import { AccountError, accountError, accountJson, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { createContact, listContacts } from '@/lib/account/people';
import { createOccasion } from '@/lib/account/occasions';
import { migrateLegacyPeople } from '@/lib/account/migration';
const norm=(value:string)=>value.trim().toLocaleLowerCase().replace(/\s+/g,' ');
export async function POST(req:NextRequest){try{
 const actor=await requireAccountActor(req,true);const body=await readAccountBody(req);const batch=req.headers.get('Idempotency-Key')||'';
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(batch))throw new AccountError('invalid_idempotency_key','Retry this import with a valid save key.');
 if(!Array.isArray(body.rows)||body.rows.length>100)throw new AccountError('invalid','Choose up to 100 people to import.');
 await migrateLegacyPeople(actor);const existing=(await listContacts(actor,undefined,50)).data;const results=[] as Array<{index:number;status:string;contactId?:string;occasionId?:string;error?:string}>;
 for(let i=0;i<body.rows.length;i++){
  const row=body.rows[i];if(!row||typeof row!=='object'||Array.isArray(row)){results.push({index:i,status:'error',error:'This row is invalid.'});continue;}
  const item=row as Record<string,unknown>;const displayName=typeof item.displayName==='string'?item.displayName.trim():'';
  if(!displayName){results.push({index:i,status:'error',error:'Add a name before importing.'});continue;}
  const incomingAddress=item.address&&typeof item.address==='object'?item.address as Record<string,unknown>:null;
  const same=existing.find(person=>norm(person.displayName)===norm(displayName)&&(!incomingAddress||!person.address||norm(person.address.street1)===norm(String(incomingAddress.street1||''))&&norm(person.address.zip)===norm(String(incomingAddress.zip||''))));
  if(same){results.push({index:i,status:'possible_duplicate',contactId:same.id});continue;}
  try{const contact=await createContact(actor,item,`${batch}_${i}`);existing.push(contact);let occasionId:string|undefined;const importedEvent=item.occasion&&typeof item.occasion==='object'?item.occasion as Record<string,unknown>:null;if(importedEvent){try{const occasion=await createOccasion(actor,{...importedEvent,contactId:contact.id,recurrence:'annual',reminderEnabled:false,lateReminderRequested:false},`${batch}_${i}_occasion`);occasionId=occasion.id;}catch{/* Keep the imported person; reminder consent stays off. */}}results.push({index:i,status:'created',contactId:contact.id,...(occasionId?{occasionId}:{})});}
  catch{results.push({index:i,status:'error',error:'This person could not be saved. Retry this row.'});}
 }
 return accountJson({results,created:results.filter(x=>x.status==='created').length,occasionsCreated:results.filter(x=>x.occasionId).length,possibleDuplicates:results.filter(x=>x.status==='possible_duplicate').length,errors:results.filter(x=>x.status==='error').length});
}catch(e){return accountError(e);}}
