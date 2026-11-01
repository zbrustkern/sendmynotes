import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
async function main() {
 (process.env as Record<string,string>).NODE_ENV='test'; process.env.USE_MOCK_FIRESTORE='true';
 process.env.SMN_TEST_DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'smn-upload-checkout-'));
 process.env.LOB_ENV='staging_mock_cass';process.env.ALLOW_LOCAL_MOCK_PAYMENTS='true';process.env.NEXT_PUBLIC_APP_URL='http://localhost:3000';
 const {pinUploadOrderMaster,stripPrivateOrderMedia}=await import('../lib/upload/order-master');
 const {UploadError}=await import('../lib/upload/contracts');
 const bytes=Buffer.from('immutable accepted print bytes');const hash=createHash('sha256').update(bytes).digest('hex');
 const selection={source:'upload',designId:'design-1',revision:1,masterSha256:hash,title:'Thank You',accepted:true};
 const req=new NextRequest('http://localhost:3000/api/checkout/create-intent',{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000'}});
 const writes:any[]=[];
 const deps={actor:async()=>({uid:'owner'}),validate:async(uid:string,s:unknown)=>{assert.equal(uid,'owner');assert.deepEqual(s,selection);return {id:'design-1',uid:'owner',generationId:'gen-1',revision:1,masterSha256:hash,masterKey:'private/design',exactText:'Thank You',treatmentId:'playful-stack' as const,standardsVersion:1,acceptedAt:Date.now(),createdAt:Date.now(),expiresAt:Date.now()+1000};},read:async()=>bytes,write:async(uid:string,orderId:string,buffer:Buffer)=>{writes.push([uid,orderId,buffer]);return `upload-orders/test/owner/order/${orderId}.png`;}};
 const pinned=await pinUploadOrderMaster(req,{uploadDesign:selection,userId:'attacker'},'order_test',deps);
 assert.equal(pinned?.uid,'owner');assert.equal(pinned?.masterSha256,hash);assert.equal(writes[0][2],bytes);assert.equal(writes[0][1],'order_test');assert.equal(writes.length,1);
 await assert.rejects(pinUploadOrderMaster(req,{uploadDesign:selection,frontImageUrl:'https://evil.test/image'},'order_test',deps),(e:any)=>e.code==='mixed_cover');
 const customDomainReq=new NextRequest('http://internal/api/checkout/create-intent',{method:'POST',headers:{origin:'https://staging.sendmynotes.com',host:'internal','x-forwarded-host':'staging.sendmynotes.com','x-forwarded-proto':'https'}});
 assert.equal((await pinUploadOrderMaster(customDomainReq,{uploadDesign:selection},'order_custom_domain',deps))?.uid,'owner','custom staging domain uses request origin, not canonical hosted URL');
 await assert.rejects(pinUploadOrderMaster(new NextRequest(customDomainReq.url,{method:'POST',headers:{origin:'https://foreign.example',host:'staging.sendmynotes.com','x-forwarded-proto':'https'}}),{uploadDesign:selection},'order_denied',deps),(e:any)=>e.code==='origin_forbidden');
 const before=writes.length;
 await assert.rejects(pinUploadOrderMaster(req,{uploadDesign:selection},'order_test',{...deps,read:async()=>Buffer.from('changed')}),(e:any)=>e.code==='master_mismatch');assert.equal(writes.length,before);
 await assert.rejects(pinUploadOrderMaster(req,{uploadDesign:selection},'order_test',{...deps,validate:async()=>{throw new UploadError('access_denied','Revoked',403);}}),(e:any)=>e.status===403);assert.equal(writes.length,before);
 assert.equal(await pinUploadOrderMaster(req,{frontImageUrl:'/presets/a.jpg'},'order_test',deps),undefined);
 assert.equal('uploadMaster' in stripPrivateOrderMedia({id:'test',uploadMaster:pinned} as any),false);
 const {POST}=await import('../app/api/checkout/create-intent/route');
 const address={firstName:'Test',lastName:'Sender',street1:'1 Test Street',city:'Austin',state:'TX',zip:'78701',country:'US'};
 for (const discountCode of [undefined,'FREE']) {
  const response=await POST(new NextRequest(req.url,{method:'POST',headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({uploadDesign:selection,userId:'owner',recipientAddress:address,returnAddress:address,discountCode})}));
  assert.equal(response.status,401,'Upload requires verified actor before paid or discount side effects');
 }
 const {getOrdersCollection}=await import('../lib/firebase-admin');assert.equal((await getOrdersCollection().get()).size,0);
 console.log('upload checkout: byte identity, verified UID, mixed/stale/revoked rejection, private serialization and pre-payment auth passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
