import assert from 'node:assert/strict';
import { AccountActor } from '@/lib/account/contracts';
import { AccountError, accountScope } from '@/lib/account/http';
import { civilString, localCivilDate, localTimeToEpoch, occurrenceDate, occurrenceSchedule, shiftCivilDate, validateOccasionDate } from '@/lib/account/calendar';
import { createContact, getContact, updateContact } from '@/lib/account/people';
import { createOccasion, getOccasion } from '@/lib/account/occasions';
import { hasLegacyPeopleMigration, migrateLegacyPeople } from '@/lib/account/migration';
import { dispatchDueReminders, renderReminderMessage } from '@/lib/reminders-v2/engine';
import { firestoreDb, getOrdersCollection } from '@/lib/firebase-admin';
import { saveAccountPreferences } from '@/lib/account/preferences';
import { suppressReminderForAcceptedOrder } from '@/lib/reminders-v2/engine';

const actor:AccountActor={uid:'lane1-test-owner',email:'owner@example.invalid',emailVerified:true};
const other:AccountActor={uid:'lane1-other-owner',email:'other@example.invalid',emailVerified:true};
const throwsCode=async(work:()=>Promise<unknown>,code:string)=>{await assert.rejects(work,error=>error instanceof AccountError&&error.code===code);};

async function run(){
  // Real calendar validation and timezone wall-clock behavior, independent of runner timezone.
  validateOccasionDate({month:2,day:29,recurrence:'annual',leapDayPolicy:'feb28'});
  validateOccasionDate({month:2,day:29,year:1900,recurrence:'annual',leapDayPolicy:'feb28'});
  assert.throws(()=>validateOccasionDate({month:2,day:29,year:1899,recurrence:'annual',leapDayPolicy:'feb28'}));
  assert.throws(()=>validateOccasionDate({month:2,day:29,year:2201,recurrence:'annual',leapDayPolicy:'feb28'}));
  assert.throws(()=>validateOccasionDate({month:2,day:29,year:2026.5,recurrence:'annual',leapDayPolicy:'feb28'}));
  assert.throws(()=>validateOccasionDate({month:4,day:31,recurrence:'annual',leapDayPolicy:'feb28'}));
  const leap={month:2,day:29,recurrence:'annual' as const,leapDayPolicy:'feb28' as const};
  assert.equal(civilString(occurrenceDate(leap,{year:2025,month:1,day:1})!), '2025-02-28');
  assert.equal(civilString(occurrenceDate({...leap,leapDayPolicy:'mar1'},{year:2025,month:1,day:1})!), '2025-03-01');
  assert.throws(()=>validateOccasionDate({month:4,day:31,year:2026,recurrence:'once',leapDayPolicy:'feb28'}));
  const boundary=occurrenceSchedule({id:'date1',version:1,createdAt:1,updatedAt:1,contactId:'p1',title:'Birthday',type:'birthday',month:11,day:15,recurrence:'annual',leapDayPolicy:'feb28',reminderEnabled:true,leadDays:14},'America/Chicago',Date.parse('2026-11-01T08:00:00Z'))!;
  assert.equal(boundary.date,'2026-11-15');assert.equal(boundary.daysUntil,14);assert.equal(boundary.late,false);
  assert.equal(civilString(localCivilDate(boundary.dueAt,'America/Chicago')),'2026-11-01');
  assert.equal(new Intl.DateTimeFormat('en-US',{hour:'numeric',timeZone:'America/Chicago'}).format(boundary.dueAt),'9 AM');
  const late=occurrenceSchedule({...({id:'date2',version:1,createdAt:1,updatedAt:1,contactId:'p1',title:'Birthday',type:'birthday',month:11,day:10,recurrence:'annual',leapDayPolicy:'feb28',reminderEnabled:true,leadDays:14} as const)},'America/Chicago',Date.parse('2026-11-01T08:00:00Z'))!;
  assert.equal(late.late,true);assert.equal(civilString(localCivilDate(late.dueAt,'America/Chicago')),'2026-11-02');
  const dst=localTimeToEpoch({year:2027,month:3,day:14},9,'America/Chicago');
  assert.equal(new Intl.DateTimeFormat('en-US',{hour:'numeric',timeZone:'America/Chicago'}).format(dst),'9 AM');

  const contact=await createContact(actor,{displayName:'Test person',relationship:'Friend'},'create-contact-001');
  assert.equal((await createContact(actor,{displayName:'Ignored retry'},'create-contact-001')).id,contact.id,'same idempotency key must replay same contact');
  assert.equal(contact.address,null,'a saved person can omit mailing address');
  assert.equal(await getContact(other,contact.id),null,'another owner cannot read contact');
  const updated=await updateContact(actor,contact.id,{displayName:'Test person',notes:'Private note'},1);
  assert.equal(updated.version,2);
  await throwsCode(()=>updateContact(actor,contact.id,{displayName:'Stale'},1),'conflict');

  // Keep this opt-in fixture outside the late-reminder window as the real date advances.
  const futureBirthday=shiftCivilDate(localCivilDate(Date.now(),'America/Chicago'),40);
  const event=await createOccasion(actor,{contactId:contact.id,title:'Birthday',type:'birthday',month:futureBirthday.month,day:futureBirthday.day,recurrence:'annual',reminderEnabled:true},'create-event-001');
  assert.equal(event.reminderEnabled,true);
  assert.equal((await getOccasion(other,event.id)),null,'another owner cannot read occasion');
  const storedOccurrences=await firestoreDb.collection('account_reminder_occurrences').where('ownerUid','==',actor.uid).where('occasionId','==',event.id).get();
  assert.equal(storedOccurrences.size,1,'explicit opt-in creates one stable reminder occurrence');
  await throwsCode(()=>createOccasion(actor,{contactId:'foreign-contact',title:'Birthday',type:'birthday',month:11,day:15,recurrence:'annual'},'create-event-002'),'not_found');

  await firestoreDb.collection('users').doc('lane1-migration-owner').set({uid:'lane1-migration-owner',savedAddresses:[{id:'old-1',firstName:'Legacy',lastName:'Person',street1:'1 Main St',city:'Chicago',state:'IL',zip:'60601',country:'US',occasionMonth:2,occasionDay:29,remindMe:true}]});
  const legacyActor:AccountActor={uid:'lane1-migration-owner',email:'legacy@example.invalid',emailVerified:false};
  const originalRunTransaction=firestoreDb.runTransaction.bind(firestoreDb);let failFirstMigrationWrite=true;
  (firestoreDb as unknown as {runTransaction:typeof firestoreDb.runTransaction}).runTransaction=async (work:any,options?:any)=>{
    if(failFirstMigrationWrite){failFirstMigrationWrite=false;throw new Error('synthetic first migration write failure');}
    return originalRunTransaction(work,options);
  };
  await assert.rejects(()=>migrateLegacyPeople(legacyActor),/synthetic first migration write failure/);
  (firestoreDb as unknown as {runTransaction:typeof firestoreDb.runTransaction}).runTransaction=originalRunTransaction;
  assert.equal(await hasLegacyPeopleMigration(legacyActor),false,'a failed row write must leave migration eligible for retry');
  const first=await migrateLegacyPeople(legacyActor);const second=await migrateLegacyPeople(legacyActor);
  assert.equal(first.migrated,true);assert.equal(second.migrated,false);assert.equal(await hasLegacyPeopleMigration(legacyActor),true);
  const legacyPerson=(await firestoreDb.collection('account_people').where('ownerUid','==',legacyActor.uid).get()).docs[0]?.data();
  const legacyEvent=(await firestoreDb.collection('account_occasions').where('ownerUid','==',legacyActor.uid).get()).docs[0]?.data();
  assert.ok(legacyPerson);assert.ok(legacyEvent);assert.equal(legacyEvent?.reminderEnabled,false,'legacy checkbox state is not new consent');

  const message=renderReminderMessage({to:actor.email,contactName:'Test person',title:'Birthday',date:'2026-11-15',daysRemaining:14,startUrl:'https://sendmynotes.com/new',unsubscribeUrl:'https://sendmynotes.com/unsubscribe',idempotencyKey:'stable-key'});
  assert.equal(message.to,actor.email);assert.match(message.text,/Start a card/);assert.doesNotMatch(message.text,/street|60601|Private note/i);
  const old=process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE;delete process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE;
  const disabled=await dispatchDueReminders(Date.now());
  assert.equal(disabled.considered,0,'worker is a no-op unless the external delivery gate is explicitly active');
  // The actual dispatch path can only send through an explicitly injected fake transport in tests.
  const today=localCivilDate(Date.now(),'America/Chicago');
  const target=shiftCivilDate(today,40);
  const recurring=await createOccasion(actor,{contactId:contact.id,title:'Test date',type:'other',month:target.month,day:target.day,recurrence:'annual',reminderEnabled:true},'dispatch-test-event');
  const initialSchedule=occurrenceSchedule(recurring,'America/Chicago',Date.now())!;
  const frozenDueDate=initialSchedule.dueLocalDate;
  await saveAccountPreferences(actor,{expectedVersion:1,timeZone:'Pacific/Honolulu',confirmTimeZone:true});
  const changedZoneDueAt=localTimeToEpoch({year:Number(frozenDueDate.slice(0,4)),month:Number(frozenDueDate.slice(5,7)),day:Number(frozenDueDate.slice(8,10))},9,'Pacific/Honolulu');
  const sent:Array<{date:string;key:string}>=[];
  const fake={send:async(message:{date?:string;idempotencyKey:string;to:string})=>{sent.push({date:message.date||'',key:message.idempotencyKey});return {accepted:true,providerId:'fake-accepted'};}};
  const injected={actorResolver:async(uid:string)=>uid===actor.uid?actor:null};
  await dispatchDueReminders(changedZoneDueAt+60_000,fake,injected); // updates the UTC instant while retaining the civil due date
  const dispatched=await dispatchDueReminders(changedZoneDueAt+120_000,fake,injected);
  assert.ok(dispatched.accepted>=1,'a due occurrence dispatches through the injected transport');
  assert.ok(sent.some(row=>row.key.endsWith(':email')),'dispatch uses a stable idempotency key');
  const afterDuplicate=await dispatchDueReminders(changedZoneDueAt+120_000,fake,injected);
  assert.equal(afterDuplicate.accepted,0,'accepted occurrences are not sent again');
  const lateTarget=shiftCivilDate(today,3);
  const lateEvent=await createOccasion(actor,{contactId:contact.id,title:'Late test',type:'other',month:lateTarget.month,day:lateTarget.day,recurrence:'annual',reminderEnabled:true,lateReminderRequested:true},'dispatch-late-event');
  const lateSchedule=occurrenceSchedule(lateEvent,'Pacific/Honolulu',Date.now())!;
  assert.equal(lateSchedule.late,true);
  assert.equal(lateSchedule.dueLocalDate,civilString(shiftCivilDate(localCivilDate(Date.now(),'Pacific/Honolulu'),1)));
  const lateDispatch=await dispatchDueReminders(lateSchedule.dueAt+60_000,fake,injected);
  assert.ok(lateDispatch.accepted>=1,'an opted-in late reminder keeps its original due instant and can dispatch');
  const uncertainTarget=shiftCivilDate(today,45);
  await createOccasion(actor,{contactId:contact.id,title:'Uncertain test',type:'other',month:uncertainTarget.month,day:uncertainTarget.day,recurrence:'annual',reminderEnabled:true},'dispatch-uncertain-event');
  const uncertainDue=occurrenceSchedule({ ...recurring,month:uncertainTarget.month,day:uncertainTarget.day },'Pacific/Honolulu',Date.now())!.dueAt;
  const uncertain=await dispatchDueReminders(uncertainDue+60_000,{send:async()=>{throw new Error('simulated lost provider response');}},injected);
  assert.ok(uncertain.uncertain>=1,'unknown provider outcome is recorded as uncertain, not retried');
  const fairTarget=shiftCivilDate(today,40);
  const fairEvent=await createOccasion(actor,{contactId:contact.id,title:'Fair worker test',type:'other',month:fairTarget.month,day:fairTarget.day,recurrence:'annual',reminderEnabled:true},'dispatch-fair-event');
  const fairDue=occurrenceSchedule(fairEvent,'Pacific/Honolulu',Date.now())!.dueAt;
  const fairDispatchAt=fairDue+60_000;
  const occurrenceRows=firestoreDb.collection('account_reminder_occurrences');
  for(let i=0;i<51;i++){
    const uid=`fair-skip-owner-${i}`;
    await occurrenceRows.doc(`fair-skip-${i}`).set({id:`fair-skip-${i}`,ownerUid:uid,ownerScope:accountScope(uid),occasionId:'missing-event',occurrenceDate:fairEvent.nextOccurrence,dueAt:fairDue-60_000,nextCheckAt:fairDue-60_000,eventVersion:1,state:'pending',attemptCount:0,idempotencyKey:`${uid}:email`});
  }
  const fairSent:string[]=[];
  const fairTransport={send:async(message:{idempotencyKey:string})=>{fairSent.push(message.idempotencyKey);return{accepted:true,providerId:'fair-fake'};}};
  const firstFairPass=await dispatchDueReminders(fairDispatchAt,fairTransport,injected);
  assert.equal(fairSent.length,0,'the first bounded page contains only the 51-row backlog prefix and cannot reach the eligible row');
  const deferredFairRows=await occurrenceRows.where('state','==','pending').get();
  assert.equal(deferredFairRows.docs.filter(doc=>String(doc.data()?.ownerUid||'').startsWith('fair-skip-owner-')&&Number(doc.data()?.nextCheckAt)>fairDispatchAt).length,50,'temporarily unavailable owners leave the hot eligibility page');
  const secondFairPass=await dispatchDueReminders(fairDispatchAt+1,fairTransport,injected);
  assert.ok(firstFairPass.skipped>=50&&secondFairPass.accepted>=1&&fairSent.some(key=>key.includes(fairEvent.id)),'eligible work makes progress on the next invocation despite over 50 skipped rows');
  const missedTarget=shiftCivilDate(today,40);
  const missedEvent=await createOccasion(actor,{contactId:contact.id,title:'Missed annual test',type:'other',month:missedTarget.month,day:missedTarget.day,recurrence:'annual',reminderEnabled:true},'dispatch-missed-event');
  const missedDue=occurrenceSchedule(missedEvent,'Pacific/Honolulu',Date.now())!.dueAt;
  await dispatchDueReminders(missedDue+49*60*60*1000,fake,injected);
  const missedRows=await firestoreDb.collection('account_reminder_occurrences').where('ownerUid','==',actor.uid).where('occasionId','==',missedEvent.id).get();
  const missedRow=missedRows.docs.find(doc=>doc.data()?.occurrenceDate===missedEvent.nextOccurrence);
  const nextAfterMiss=missedRows.docs.find(doc=>doc.data()?.state==='pending');
  assert.equal(missedRow?.data()?.state,'missed','an occurrence outside the grace window is terminal');
  assert.ok(nextAfterMiss&&nextAfterMiss.data()?.occurrenceDate!==missedEvent.nextOccurrence,'a missed annual occurrence queues the following year without retrying the missed send');
  const orderTarget=shiftCivilDate(today,55);
  const orderEvent=await createOccasion(actor,{contactId:contact.id,title:'Order suppression test',type:'other',month:orderTarget.month,day:orderTarget.day,recurrence:'annual',reminderEnabled:true},'dispatch-order-event');
  const orderSchedule=occurrenceSchedule(orderEvent,'Pacific/Honolulu',Date.now())!;
  await getOrdersCollection().doc('lane1-accepted-order').set({id:'lane1-accepted-order',userId:actor.uid,accountOccasionId:orderEvent.id,occasionOccurrenceDate:orderSchedule.date,accountAcceptedAt:Date.now(),status:'PAYMENT_RECEIVED'} as never);
  const sentBeforeSuppression=sent.length;
  await dispatchDueReminders(orderSchedule.dueAt+60_000,fake,injected);
  assert.equal(sent.length,sentBeforeSuppression,'a verified accepted card for this exact occurrence suppresses the reminder');
  const hookTarget=shiftCivilDate(today,60);
  const hookEvent=await createOccasion(actor,{contactId:contact.id,title:'Order hook test',type:'other',month:hookTarget.month,day:hookTarget.day,recurrence:'annual',reminderEnabled:true},'dispatch-order-hook-event');
  await suppressReminderForAcceptedOrder(actor.uid,hookEvent.id,hookEvent.nextOccurrence!,'trusted-order-hook');
  const hookOccurrence=await firestoreDb.collection('account_reminder_occurrences').where('ownerUid','==',actor.uid).where('occasionId','==',hookEvent.id).get();
  assert.ok(hookOccurrence.docs.some(doc=>doc.data()?.state==='cancelled'&&doc.data()?.occurrenceDate===hookEvent.nextOccurrence),'accepted-order hook cancels only the matching pending occurrence');
  assert.ok(hookOccurrence.docs.some(doc=>doc.data()?.state==='pending'&&doc.data()?.occurrenceDate!==hookEvent.nextOccurrence),'accepted-order suppression queues the following annual occurrence');
  if(old!==undefined)process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE=old;
  console.log('SPRINT-0024 people/reminders checks passed');
}

run().catch(error=>{console.error(error);process.exitCode=1;});
