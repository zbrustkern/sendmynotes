import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { projectMultiSendView, deliveryStatus } from '../lib/multi-send/presentation';
import { Step4ReviewAndPayment } from '../components/v3/Step4ReviewAndPayment';
import { Step2NoteComposition } from '../components/v3/Step2NoteComposition';
import { MultiSendAddressEditor } from '../components/v3/MultiSendAddressEditor';
import type { Order } from '../lib/types';
(globalThis as unknown as { React: typeof React }).React = React;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'smn28-view-'));
process.env.SMN_TEST_DATA_DIR=dir;process.env.USE_MOCK_FIRESTORE='true';
const address={firstName:'Maya',lastName:'Example',street1:'123 Fictional Lane',city:'Portland',state:'OR',zip:'97205',country:'US'};
const recipients=[{id:'r1',address,greeting:{mode:'custom',text:'Dear Maya,'},resolvedGreeting:'Dear Maya,',printedMessage:'Dear Maya,\n\nShared body\n\nAlex',amountInCents:900},{id:'r2',address:{...address,firstName:'Jordan'},greeting:{mode:'custom',text:''},resolvedGreeting:'',printedMessage:'Shared body\n\nAlex',amountInCents:900}];
const order={id:'order_multiview',customerEmail:'owner@example.test',recipientAddress:address,returnAddress:address,printedMessage:'Dear Maya,',handwrittenNote:'Shared body',frontImageUrl:'/presets/holiday-evergreen.jpg',fontStyleId:'1',status:'PAYMENT_RECEIVED',amountInCents:1800,viewToken:'test-private-capability',multiSend:{version:1,kind:'parent',recipients,shared:{frontImageUrl:'/presets/holiday-evergreen.jpg',note:{text:'Shared body',style:'1'},returnAddress:address,fontStyleId:'1'},quote:{totalCents:1800},manifestComplete:false}} as unknown as Order;
async function main(){
 assert.deepEqual(projectMultiSendView(order,[],false),{quantity:2,redacted:true,deliveries:[]});
 const rows=projectMultiSendView(order,[{parentOrderId:order.id,recipientId:'r1',state:'DISPATCH_UNCERTAIN',address,error:'SECRET_RAW_SUPPLIER',supplierOrderId:'SECRET_SUPPLIER'} as any,{parentOrderId:order.id,recipientId:'r2',state:'REJECTED',address:recipients[1].address} as any],true)!;
 assert.equal(rows.deliveries[0].status,'Checking this card');assert.equal(rows.deliveries[0].needsSupport,false);assert.equal(rows.deliveries[1].needsSupport,true);assert.equal(rows.deliveries[1].greeting,'');assert(!JSON.stringify(rows).includes('SECRET'));
 assert.equal(deliveryStatus('ACCEPTED').label,'Being prepared');assert.equal(deliveryStatus('MAILED').label,'Mailed');
 const {getOrdersCollection}=await import('../lib/firebase-admin');await getOrdersCollection().doc(order.id).set(order);
 const {GET,POST}=await import('../app/api/orders/[id]/route');
 const params={params:Promise.resolve({id:order.id})};
 const publicResponse=await GET(new NextRequest(`http://localhost/api/orders/${order.id}`),params);const publicBody=await publicResponse.json();assert.equal(publicResponse.status,200,JSON.stringify(publicBody));
 assert.equal(publicBody.order.multiSend,undefined);assert.equal(publicBody.order.multiSendView.redacted,true);assert(!JSON.stringify(publicBody).includes('Dear Maya'));assert(!JSON.stringify(publicBody).includes('123 Fictional'));assert(!JSON.stringify(publicBody).includes('test-private-capability'));
 const verified=await GET(new NextRequest(`http://localhost/api/orders/${order.id}?token=${order.viewToken}`),params);const privateBody=await verified.json();assert.equal(verified.status,200,JSON.stringify(privateBody));assert.equal(privateBody.order.multiSend,undefined);assert.equal(privateBody.order.multiSendView.deliveries.length,2);assert.equal(privateBody.order.multiSendView.deliveries[1].message,'Shared body\n\nAlex');
 const zipUnlock=await POST(new NextRequest(`http://localhost/api/orders/${order.id}`,{method:'POST',body:JSON.stringify({zip:'97205',email:'owner@example.test'})}),params);assert.equal(zipUnlock.status,403);
 const {buildPurchaseMeasurement}=await import('../lib/purchase-measurement');
 const purchase=buildPurchaseMeasurement({...order,stripePaymentId:'pi_batch',paymentMethod:'STRIPE',paymentMode:'live'}, {paymentIntentId:'pi_batch',amount:1800,amountReceived:1800,currency:'usd',livemode:true});assert.equal(purchase.itemCount,2);assert.equal(purchase.transactionId,order.id);assert.equal(purchase.amountInCents,1800);assert(purchase.eligible);
 const {GET:adminGet}=await import('../app/api/admin/multi-send/deliveries/route');
 const {generateAdminSessionToken,ADMIN_COOKIE_NAME}=await import('../lib/admin-auth');
 const adminUrl=`http://localhost/api/admin/multi-send/deliveries?orderId=${order.id}`;
 assert.equal((await adminGet(new NextRequest(adminUrl))).status,401);
 const adminResult=await adminGet(new NextRequest(adminUrl,{headers:{cookie:`${ADMIN_COOKIE_NAME}=${generateAdminSessionToken('zbrustkern@gmail.com')}`}}));
 assert.equal(adminResult.status,200);const adminBody=await adminResult.json();assert.equal(adminBody.deliveries.length,2);assert(!JSON.stringify(adminBody).includes('Fictional'));assert(!JSON.stringify(adminBody).includes('Dear Maya'));
 const {revealOrderPiiWithAudit,ADMIN_AUDIT_LOG_COLLECTION}=await import('../lib/investigation-service');
 const revealed=await revealOrderPiiWithAudit({orderId:order.id,operatorId:'test-operator',reason:'Inspect failed recipient card'});assert.equal(revealed.multiSendView?.deliveries[1].greeting,'');
 const {firestoreDb}=await import('../lib/firebase-admin');const audit=await firestoreDb.collection(ADMIN_AUDIT_LOG_COLLECTION).doc(revealed.auditId).get();assert(audit.exists);assert(audit.data()?.fields.includes('multiSend.recipients'));
 assert.equal(verified.headers.get('cache-control'),'private, no-store, max-age=0');

 // C6 — Step 4 multi-send desktop preview box and recipient row preview controls
 const step4Html = renderToStaticMarkup(
   React.createElement(Step4ReviewAndPayment, {
     multiSendRecipients: [
       { id: 'r1', name: 'Sarah Lee', city: 'Chicago', state: 'IL', greeting: 'Dear Sarah,' },
       { id: 'r2', name: 'Uncle Bob', city: 'Austin', state: 'TX', greeting: 'Dear Uncle Bob,' },
     ],
     multiSendSelectedRecipientId: 'r2',
     cardTitle: 'Evergreen Wishes',
     cardUrl: '/presets/holiday-evergreen.jpg',
     salutation: 'Dear Sarah,',
     bodyNote: 'Thinking of you this season.',
     signOff: 'Warmly,\nEzekiel',
     fontClass: 'font-David',
     fontStyleId: 'hwDavid',
     recipient: { fullName: 'Sarah Lee', street1: '1 Main St', street2: '', city: 'Chicago', state: 'IL', zip: '60601', country: 'US' },
     sender: { fullName: 'Ezekiel Sender', street1: '2 Main St', street2: '', city: 'Chicago', state: 'IL', zip: '60601', country: 'US' },
     customerEmail: 'owner@example.test',
     onChangeCustomerEmail: () => {},
     orderId: 'order_step4_preview',
     viewToken: 'tok_step4',
     clientSecret: null,
     publishableKey: null,
     isMock: true,
     isFree: false,
     amountInCents: 1800,
     appliedDiscount: null,
     onApplyDiscount: async () => ({ success: true }),
     onRemoveDiscount: () => {},
     onPaymentSuccess: () => {},
     onBack: () => {},
   })
 );
 assert(step4Html.includes('data-testid="step4-preview-recipient-0"'), 'Step 4 recipient 0 preview button testid present');
 assert(step4Html.includes('data-testid="step4-preview-recipient-1"'), 'Step 4 recipient 1 preview button testid present');
 assert(step4Html.includes('data-testid="step4-active-recipient-preview-label"'), 'Step 4 active recipient preview label present');
 assert(step4Html.includes('Previewing card for Uncle Bob'), 'Step 4 active recipient preview label shows selected recipient');
 assert(step4Html.includes('data-testid="step4-note-preview-text"'), 'Step 4 note preview text container present');
 assert(step4Html.includes('color:#1B3B6F'), 'Step 4 note preview uses uniform #1B3B6F ballpoint ink color');
 assert(
   step4Html.includes('Dear Uncle Bob,\n\nThinking of you this season.\n\nWarmly,\nEzekiel'),
   'Step 4 desktop preview renders selected recipient custom greeting, \\n\\n section spacing, and two-line \\n sign-off'
 );

 // C2 & C5 — Step 2 multi-send greeting helper copy + 2-line sign-off textarea
 const step2MultiHtml = renderToStaticMarkup(
   React.createElement(Step2NoteComposition, {
     isMultiSend: true,
     occasion: 'Holiday',
     cardTitle: 'Evergreen Wishes',
     cardUrl: '/presets/holiday-evergreen.jpg',
     salutation: 'Dear friends,',
     onChangeSalutation: () => {},
     bodyNote: 'Thinking of you this season.',
     onChangeBodyNote: () => {},
     signOff: 'Warmly,\nEzekiel',
     onChangeSignOff: () => {},
     fontStyleId: 'hwDavid',
     onChangeFontStyleId: () => {},
     onContinue: () => {},
     onBack: () => {},
   })
 );
 assert(step2MultiHtml.includes('Default greeting'), 'Step 2 shows Default greeting label when multi-send is active');
 assert(step2MultiHtml.includes('placeholder="e.g. Dear friends,"'), 'Step 2 uses collective greeting placeholder in multi-send mode');
 assert(
   step2MultiHtml.includes('Used for recipients without a personalized greeting. Personalized greetings stay unchanged.'),
   'Step 2 explains that personalized greetings stay unchanged'
 );
 assert(step2MultiHtml.includes('data-testid="note-signoff-input"'), 'Step 2 renders 2-line sign-off textarea');

 // C3 & C4 — Step 3 MultiSendAddressEditor single-name carryover warning & actions
 const multiEditorHtml = renderToStaticMarkup(
   React.createElement(MultiSendAddressEditor, {
     value: {
       version: 1,
       checkoutId: '123e4567-e89b-42d3-a456-426614174000',
       note: { salutation: 'Dear Sarah,', text: 'Thinking of you this season.', signOff: 'Warmly,\nEzekiel', style: 'hwDavid' },
       recipients: [
         {
           id: 'r1',
           address: { name: 'Sarah Lee', addressLine1: '1 Main St', addressLine2: '', city: 'Chicago', state: 'IL', zip: '60601', country: 'US' },
           greeting: { mode: 'inherit' as const },
         },
         {
           id: 'r2',
           address: { name: 'Uncle Bob', addressLine1: '2 Oak Ave', addressLine2: '', city: 'Austin', state: 'TX', zip: '78701', country: 'US' },
           greeting: { mode: 'inherit' as const },
         },
       ],
     },
     onChange: () => {},
     onRemove: () => {},
     onUndo: () => {},
     defaultGreeting: 'Dear Sarah,',
     bodyNote: 'Thinking of you this season.',
     signOff: 'Warmly,\nEzekiel',
   })
 );
 assert(!multiEditorHtml.includes('data-testid="multi-send-greeting-mismatch-0"'), 'Recipient 0 (Sarah Lee) does not warn on Dear Sarah,');
 assert(multiEditorHtml.includes('data-testid="multi-send-greeting-mismatch-1"'), 'Recipient 1 (Uncle Bob) warns on inherited Dear Sarah,');
 assert(multiEditorHtml.includes('Still says “Dear Sarah,”'), 'Mismatch callout names the inherited greeting');
 assert(multiEditorHtml.includes('data-testid="multi-send-personalize-greeting-1"'), 'Personalize greeting action rendered on mismatched recipient');
 assert(multiEditorHtml.includes('data-testid="multi-send-keep-greeting-1"'), 'Keep greeting action rendered on mismatched recipient');

 // C3 — When editing a recipient greeting, MultiSendAddressEditor uses single-line <input type="text">
 const multiEditorEditingHtml = renderToStaticMarkup(
   React.createElement(MultiSendAddressEditor, {
     value: {
       version: 1,
       checkoutId: '123e4567-e89b-42d3-a456-426614174000',
       note: { salutation: 'Dear Sarah,', text: 'Thinking of you this season.', signOff: 'Warmly,\nEzekiel', style: 'hwDavid' },
       recipients: [
         {
           id: 'r1',
           address: { name: 'Sarah Lee', addressLine1: '1 Main St', addressLine2: '', city: 'Chicago', state: 'IL', zip: '60601', country: 'US' },
           greeting: { mode: 'inherit' as const },
         },
         {
           id: 'r2',
           address: { name: 'Uncle Bob', addressLine1: '2 Oak Ave', addressLine2: '', city: 'Austin', state: 'TX', zip: '78701', country: 'US' },
           greeting: { mode: 'inherit' as const },
         },
       ],
     },
     onChange: () => {},
     onRemove: () => {},
     onUndo: () => {},
     defaultGreeting: 'Dear friends,',
     bodyNote: 'Thinking of you this season.',
     signOff: 'Warmly,\nEzekiel',
   })
 );
 assert(!multiEditorEditingHtml.includes('data-testid="multi-send-greeting-mismatch-1"'), 'Generic greeting Dear friends, does not warn');

 console.log('Multi-send read privacy, recipient snapshots and rejected/uncertain presentation passed.');
}
main().finally(()=>fs.rmSync(dir,{recursive:true,force:true})).catch(e=>{console.error(e);process.exitCode=1});
