import { createHash } from 'node:crypto';
import type { AccountActor, AccountContact, AccountOccasion } from './contracts';
import type { SavedAddress, UserAccount } from '@/lib/types';
import { firestoreDb } from '@/lib/firebase-admin';
import { accountDoc, accountScope } from './http';
import { normalizeContactInput } from './people';
import { validCivilDate } from './calendar';

const MARKER_ID = 'saved-addresses-v1';
const stable = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 32);
function sourceContactId(address: SavedAddress, index: number): string {
  const raw = typeof address.id === 'string' ? address.id.trim() : '';
  return /^[A-Za-z0-9_-]{1,80}$/.test(raw) ? `legacy_${raw}` : `legacy_${stable(`${index}:${address.firstName}:${address.lastName}:${address.street1}:${address.zip}`)}`;
}

export async function hasLegacyPeopleMigration(actor: AccountActor): Promise<boolean> {
  const marker = await accountDoc('people_migrations', actor.uid, MARKER_ID).get();
  return marker.data()?.ownerScope === accountScope(actor.uid) && marker.data()?.version === 1;
}

/** Repeatable bootstrap migration. Old reminder booleans are intentionally not migrated as consent. */
export async function migrateLegacyPeople(actor: AccountActor): Promise<{ migrated: boolean; contacts: number; occasions: number }> {
  if (await hasLegacyPeopleMigration(actor)) return { migrated: false, contacts: 0, occasions: 0 };
  const userSnap = await firestoreDb.collection('users').doc(actor.uid).get();
  const user = userSnap.data() as Partial<UserAccount> | undefined;
  const addresses = Array.isArray(user?.savedAddresses) ? user!.savedAddresses! : [];
  const scope = accountScope(actor.uid);
  let contacts = 0, occasions = 0;
  for (let index=0; index<addresses.length; index++) {
    const address = addresses[index] as SavedAddress;
    const contactId = sourceContactId(address,index);
    const contactRef = accountDoc('people',actor.uid,contactId);
    const contactSnap = await contactRef.get();
    if (!contactSnap.exists) {
      const name = `${String(address.firstName||'').trim()} ${String(address.lastName||'').trim()}`.trim() || String(address.label||'').trim() || 'Saved person';
      let content;
      try { const country=String(address.country||'US').trim().toLowerCase(); content = normalizeContactInput({displayName:name,relationship:'',notes:'',address:{firstName:address.firstName||'',lastName:address.lastName||'',street1:address.street1||'',street2:address.street2||'',city:address.city||'',state:address.state||'',zip:address.zip||'',country:country==='usa'||country==='united states'?'US':country.toUpperCase()}}); }
      catch { content = normalizeContactInput({displayName:name,relationship:'',notes:'',address:null}); }
      const now=Date.now();
      const row: AccountContact & {ownerUid:string;ownerScope:string;migratedFrom:string} = {id:contactId,...content,version:1,createdAt:now,updatedAt:now,ownerUid:actor.uid,ownerScope:scope,migratedFrom:'users.savedAddresses'};
      let created=false; await firestoreDb.runTransaction(async tx => { const existing = await tx.get(contactRef); if (!existing.exists) { tx.set(contactRef, row); created=true; } }); if(created)contacts++;
    }
    const month=Number(address.occasionMonth), day=Number(address.occasionDay);
    if (month>=1&&month<=12&&day>=1&&day<=31&&validCivilDate({year:2000,month,day})) {
      const occasionId=`legacy_${stable(`${contactId}:occasion-v1`)}`;
      const occasionRef=accountDoc('occasions',actor.uid,occasionId);
      if (!(await occasionRef.get()).exists) {
        const now=Date.now();
        const type=address.occasionType==='birthday'||address.occasionType==='anniversary' ? address.occasionType : 'other';
        const row: AccountOccasion & {ownerUid:string;ownerScope:string;migratedFrom:string;consentSource:string}={
          id:occasionId,contactId,title:String(address.occasionTitle||`${nameFor(address)}'s ${type}`).trim().slice(0,120),type,
          month,day,...(address.occasionYear?{year:Number(address.occasionYear)}:{}),recurrence:'annual',leapDayPolicy:'feb28',
          reminderEnabled:false,leadDays:14,version:1,createdAt:now,updatedAt:now,ownerUid:actor.uid,ownerScope:scope,
          migratedFrom:'users.savedAddresses',consentSource:'legacy_consent_unverified',
        };
        let created=false; await firestoreDb.runTransaction(async tx => { const existing = await tx.get(occasionRef); if (!existing.exists) { tx.set(occasionRef, row); created=true; } }); if(created)occasions++;
      }
    }
  }
  const markerRef=accountDoc('people_migrations',actor.uid,MARKER_ID);
  const marker={ownerUid:actor.uid,ownerScope:scope,version:1,source:'users.savedAddresses',sourceCount:addresses.length,contactsCreated:contacts,occasionsCreated:occasions,completedAt:Date.now()};
  await firestoreDb.runTransaction(async tx=>{
    const existing=await tx.get(markerRef);
    if(existing.data()?.ownerScope!==scope) tx.set(markerRef,marker);
  });
  return {migrated:true,contacts,occasions};
}

function nameFor(address: SavedAddress): string { return `${String(address.firstName||'').trim()} ${String(address.lastName||'').trim()}`.trim() || 'Saved person'; }
