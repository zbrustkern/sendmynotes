import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { AccountError, accountError, accountJson, readAccountBody, requireAccountActor, accountScope, accountDoc } from '@/lib/account/http';
import { createContact, getAccountContact, listContacts, normalizeContactInput } from '@/lib/account/people';
import { createOccasion, getAccountOccasion } from '@/lib/account/occasions';
import { migrateLegacyPeople } from '@/lib/account/migration';
import type { AccountContact } from '@/lib/account/contracts';

const norm=(value:string)=>value.trim().toLocaleLowerCase().replace(/\s+/g,' ');
const duplicate=(person:AccountContact,displayName:string,address:Record<string,unknown>|null)=>norm(person.displayName)===norm(displayName)&&(!address||!person.address||norm(person.address.street1)===norm(String(address.street1||''))&&norm(person.address.zip)===norm(String(address.zip||'')));
const expectedContactId=(uid:string,key:string)=>`c_${createHash('sha256').update(`${accountScope(uid)}:${key}`).digest('hex').slice(0,32)}`;

type RowResult={index:number;contactStatus:'created'|'already_imported'|'possible_duplicate'|'error';occasionStatus:'created'|'already_imported'|'not_requested'|'error';contactId?:string;occasionId?:string;error?:string;occasionError?:string};
async function sameImportedOccasion(actor:Awaited<ReturnType<typeof requireAccountActor>>,prior:Awaited<ReturnType<typeof getAccountOccasion>>,event:Record<string,unknown>,contactId:string,remindMe:boolean){
 if(!prior)return false;
 const yearValue=event.year;
 const year=yearValue===''||yearValue===null||yearValue===undefined?undefined:Number(yearValue);
 const fieldsMatch=prior.contactId===contactId&&prior.title===String(event.title||'').trim()&&prior.type===(event.type==='birthday'||event.type==='anniversary'||event.type==='other'?event.type:'other')&&prior.month===Number(event.month)&&prior.day===Number(event.day)&&prior.year===year&&prior.recurrence==='annual'&&prior.leapDayPolicy===(event.leapDayPolicy==='mar1'?'mar1':'feb28')&&prior.reminderEnabled===remindMe&&prior.lateReminderRequested===false;
 if(!fieldsMatch)return false;
 if(!remindMe)return true;
 const stored=(await accountDoc('occasions',actor.uid,prior.id).get()).data() as {ownerScope?:string;consentAt?:number;consentSource?:string}|undefined;
 return stored?.ownerScope===accountScope(actor.uid)&&Boolean(stored.consentAt)&&stored.consentAt===prior.consentAt&&stored.consentSource==='contact_import_checkbox';
}

export async function POST(req:NextRequest){try{
 const actor=await requireAccountActor(req,true);const body=await readAccountBody(req);const batch=req.headers.get('Idempotency-Key')||'';
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(batch))throw new AccountError('invalid_idempotency_key','Retry this import with the same save key.');
 if(!Array.isArray(body.rows)||body.rows.length>100)throw new AccountError('invalid','Choose up to 100 people to import.');
 await migrateLegacyPeople(actor);
 const existing:AccountContact[]=[];let cursor:string|undefined;
 do{const page=await listContacts(actor,cursor,50);existing.push(...page.data);cursor=page.nextCursor||undefined;}while(cursor);
 const results:RowResult[]=[];const seenIndexes=new Set<number>();
 for(let position=0;position<body.rows.length;position++){
  const row=body.rows[position];if(!row||typeof row!=='object'||Array.isArray(row)){results.push({index:position,contactStatus:'error',occasionStatus:'not_requested',error:'This row is invalid.'});continue;}
  const item=row as Record<string,unknown>;const index=Number.isSafeInteger(item.importIndex)&&Number(item.importIndex)>=0&&Number(item.importIndex)<10000?Number(item.importIndex):position;
  if(seenIndexes.has(index)){results.push({index,contactStatus:'error',occasionStatus:'not_requested',error:'This import contains a repeated row key.'});continue;}seenIndexes.add(index);
  const displayName=typeof item.displayName==='string'?item.displayName.trim():'';
  if(!displayName){results.push({index,contactStatus:'error',occasionStatus:'not_requested',error:'Add a name before importing.'});continue;}
  const incomingAddress=item.address&&typeof item.address==='object'&&!Array.isArray(item.address)?item.address as Record<string,unknown>:null;
  const rowKey=`${batch}_${index}`;const deterministicId=expectedContactId(actor.uid,rowKey);
  let contact=await getAccountContact(actor,deterministicId);let contactStatus:RowResult['contactStatus']='created';
  if(contact){
    try{const normalized=normalizeContactInput(item);if(JSON.stringify(normalized)!==JSON.stringify(normalizeContactInput({displayName:contact.displayName,relationship:contact.relationship,notes:contact.notes,address:contact.address})))throw new Error('idempotency mismatch');}
    catch{results.push({index,contactStatus:'error',occasionStatus:'not_requested',contactId:contact.id,error:'This retry key belongs to different contact details.'});continue;}
    contactStatus='already_imported';
  }else{
    const same=item.allowDuplicate===true?undefined:existing.find(person=>duplicate(person,displayName,incomingAddress));
    if(same){results.push({index,contactStatus:'possible_duplicate',occasionStatus:'not_requested',contactId:same.id,error:'Review this possible duplicate before importing it.'});continue;}
    try{contact=await createContact(actor,item,rowKey);existing.push(contact);}
    catch{results.push({index,contactStatus:'error',occasionStatus:'not_requested',error:'This person could not be saved. Retry this row with the same import.'});continue;}
  }
  const importedEvent=item.occasion&&typeof item.occasion==='object'&&!Array.isArray(item.occasion)?item.occasion as Record<string,unknown>:null;
  if(!importedEvent){results.push({index,contactStatus,occasionStatus:'not_requested',contactId:contact.id});continue;}
  const wantsReminder=item.remindMe===true;
  const occasionId=`o_${createHash('sha256').update(`${accountScope(actor.uid)}:${rowKey}_occasion`).digest('hex').slice(0,32)}`;
  const prior=await getAccountOccasion(actor,occasionId);
  if(prior){
   if(await sameImportedOccasion(actor,prior,importedEvent,contact.id,wantsReminder))results.push({index,contactStatus,occasionStatus:'already_imported',contactId:contact.id,occasionId:prior.id});
   else results.push({index,contactStatus,occasionStatus:'error',contactId:contact.id,occasionId:prior.id,error:'Person saved.',occasionError:'This import key was already used with different date or reminder choices.'});
   continue;
  }
  try{
    const occasion=await createOccasion(actor,{...importedEvent,contactId:contact.id,recurrence:'annual',reminderEnabled:wantsReminder,lateReminderRequested:false},`${rowKey}_occasion`,wantsReminder?'contact_import_checkbox':'contact_import_unchecked');
    results.push({index,contactStatus,occasionStatus:'created',contactId:contact.id,occasionId:occasion.id});
  }catch(error){
    // If an earlier attempt saved the date but failed before returning, retry
    // recovers that deterministic occasion ID without creating a duplicate.
    const retryPrior=await getAccountOccasion(actor,occasionId);
    if(await sameImportedOccasion(actor,retryPrior,importedEvent,contact.id,wantsReminder)){results.push({index,contactStatus,occasionStatus:'already_imported',contactId:contact.id,occasionId:retryPrior!.id});}
    else results.push({index,contactStatus,occasionStatus:'error',contactId:contact.id,error:'Person saved.',occasionError:error instanceof Error?error.message:'The date could not be saved. Retry this row with the same import.'});
  }
 }
 const created=results.filter(x=>x.contactStatus==='created').length;
 const alreadyImported=results.filter(x=>x.contactStatus==='already_imported').length;
 const errors=results.filter(x=>x.contactStatus==='error').length;
 const occasionErrors=results.filter(x=>x.occasionStatus==='error').length;
 const possibleDuplicates=results.filter(x=>x.contactStatus==='possible_duplicate').length;
 const occasionsCreated=results.filter(x=>x.occasionStatus==='created').length;
 const occasionsAlreadyImported=results.filter(x=>x.occasionStatus==='already_imported').length;
 return accountJson({results,created,alreadyImported,occasionsCreated,occasionsAlreadyImported,possibleDuplicates,errors,occasionErrors});
}catch(e){return accountError(e);}}
