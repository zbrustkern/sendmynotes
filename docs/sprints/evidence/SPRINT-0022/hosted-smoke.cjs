const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),sharp=require('sharp'),assert=require('node:assert/strict');
const base='https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app',project='sendmynotes-staging',bucketName='sendmynotes-staging-upload-private';
process.env.GOOGLE_CLOUD_QUOTA_PROJECT=project;
async function main(){
 const fixture=JSON.parse(fs.readFileSync('.data/upload-staging-fixture.json'));if(fixture.expiresAt<Date.now())throw Error('Refresh synthetic fixture before smoke');
 const token=cp.execFileSync('/Users/zeke/Downloads/google-cloud-sdk/bin/gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();

 const cloud=async url=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+token,'x-goog-user-project':project}});if(!r.ok)throw Error('Cloud read '+r.status);return r.json();};
 const service=await cloud(`https://run.googleapis.com/v2/projects/${project}/locations/us-central1/services/${project}`);const env=Object.fromEntries(service.template.containers[0].env.map(e=>[e.name,e.value]));assert.equal(env.STAGING_REVIEW_ONLY,'true');assert.equal(env.HANDWRYTTEN_TEST_MODE,'true');assert.equal(env.UPLOAD_PRIVATE_BUCKET,bucketName);
 const namespace=env.LOB_ENV||'production';const ek=id=>namespace+'_'+id;
 const docBase=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/`;
 const decode=v=>'stringValue' in v?v.stringValue:'integerValue' in v?Number(v.integerValue):'doubleValue' in v?v.doubleValue:'booleanValue' in v?v.booleanValue:null;
 const getDoc=async(collection,id)=>Object.fromEntries(Object.entries((await cloud(docBase+collection+'/'+ek(id))).fields||{}).map(([k,v])=>[k,decode(v)]));
 const setDoc=async(collection,id,values)=>{const fields=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,typeof v==='number'?{integerValue:String(v)}:typeof v==='boolean'?{booleanValue:v}:{stringValue:v}]));const r=await fetch(docBase+collection+'/'+ek(id),{method:'PATCH',headers:{Authorization:'Bearer '+token,'x-goog-user-project':project,'Content-Type':'application/json'},body:JSON.stringify({fields})});if(!r.ok)throw Error('Fixture document write '+r.status);};
 const headers={Authorization:'Bearer '+fixture.idToken,Origin:base};const adminHeaders={Cookie:'smn_admin_session='+fixture.cookie,Origin:base};
 const api=async(path,opts={},status=200)=>{const r=await fetch(base+path,opts);const data=await r.json();if(r.status!==status)throw Error(`${path}: ${r.status} ${data.code||data.error||''}`);assert(!JSON.stringify(data).includes('upload-private/'),'Private storage key leaked');return data;};
 const json=(body,headers)=>({method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
 await api('/api/upload/access',{},401);
 await api('/api/admin/upload-access',json({email:fixture.email},adminHeaders),201);
 const access=await api('/api/upload/access',{headers});assert(access.allowed);
 const form=new FormData();form.append('file',new Blob([fs.readFileSync(__dirname+'/checks/model-comparison/synthetic-reference.png')],{type:'image/png'}),'synthetic-cottage.png');
 const upload=await api('/api/upload/assets',{method:'POST',headers,body:form},201);const assetId=upload.asset.id;
 const asset=await getDoc('uploadAssets',assetId);assert(asset?.uid===fixture.uid);const publicObject=await fetch('https://storage.googleapis.com/'+bucketName+'/'+asset.key);assert([401,403].includes(publicObject.status),'Private object public access');
 const preview=await fetch(base+'/api/upload/previews/asset/'+assetId,{headers});assert.equal(preview.status,200);assert(preview.headers.get('cache-control').includes('no-store'));await api('/api/upload/previews/asset/'+assetId,{},401);
 // One integrated synthetic provider call verifies runtime credentials, quota,
 // mandatory prompt construction, private storage and provider output handling.
 const generated=await api('/api/upload/generations',json({assetId,imagePrompt:'Paint this cottage as a warm gouache illustration. Keep the recognizable roof, windows and garden, with quiet space above.',standardsVersion:access.standards.version},{...headers,'Idempotency-Key':'hosted-smoke-'+crypto.randomUUID()}));
 assert.equal(generated.generation.status,'ready','Hosted provider generation must complete: '+generated.generation.error);
 const generationId=generated.generation.id;
 const designs=[];
 for(const treatmentId of ['playful-stack','gentle-arch','classic-serif']){
  const result=await api('/api/upload/compositions',json({generationId,exactText:'Thank You',treatmentId},headers));const d=result.design;const image=await fetch(base+'/api/upload/previews/design/'+d.designId,{headers});assert.equal(image.status,200);const bytes=Buffer.from(await image.arrayBuffer());assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),d.masterSha256);const dimensions=await sharp(bytes).metadata();assert.equal(dimensions.width,1275);assert.equal(dimensions.height,1650);fs.writeFileSync(__dirname+'/checks/hosted-'+treatmentId+'.png',bytes);designs.push(d);
 }
 const accepted=await api('/api/upload/designs/'+designs[0].designId+'/accept',json({revision:designs[0].revision,masterSha256:designs[0].masterSha256},headers));
 const resumed=await api('/api/upload/designs/'+designs[0].designId,{headers});assert.deepEqual(resumed.selection,accepted.selection);
 await api('/api/upload/designs/'+designs[0].designId+'/accept',json({revision:1,masterSha256:'0'.repeat(64)},headers),409);
 const selectedRecord=await getDoc('uploadDesigns',designs[0].designId);assert(selectedRecord.expiresAt-Date.now()>29*86400000);
 // Revoke is checked on the hosted selection endpoint, then restore for the
 // authenticated browser follow-up. No payment/fulfillment endpoint is called.
 await api('/api/admin/upload-access',{...json({uid:fixture.uid,revoked:true},adminHeaders),method:'PATCH'});
 await api('/api/upload/designs/'+designs[0].designId,{headers},403);
 await api('/api/admin/upload-access',{...json({uid:fixture.uid,revoked:false},adminHeaders),method:'PATCH'});
 const founder=await api('/api/admin/upload-access',json({email:'zbrustkern@gmail.com'},adminHeaders),201);
 const out={checkedAt:new Date().toISOString(),passed:true,servingRevision:service.latestReadyRevision,model:env.UPLOAD_IMAGE_MODEL,privateBucket:true,unauthDenied:true,grantRevokeVerified:true,sourceUploadVerified:true,threeHostedCompositions:true,previewMasterHashesMatch:true,acceptedRetention30Days:true,founderAccessGranted:!!founder.grant,providerCalls:1,paymentCalls:0,supplierCalls:0};
 fs.writeFileSync('.data/upload-staging-browser.json',JSON.stringify({assetId,generationId,selection:accepted.selection}),{mode:0o600});fs.writeFileSync(__dirname+'/checks/hosted-smoke.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
