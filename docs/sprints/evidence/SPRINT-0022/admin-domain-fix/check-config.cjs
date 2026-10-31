const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const project='sendmynotes-staging',number='910796604705';
(async()=>{
const token=cp.execFileSync('/Users/zeke/Downloads/google-cloud-sdk/bin/gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const request=async(url)=>{const r=await fetch(url,{headers:{Authorization:'Bearer '+token,'x-goog-user-project':project},signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error('Config read '+new URL(url).pathname+' '+r.status+' '+(d.error?.message||''));return d;};
const source=fs.readFileSync('lib/firebase-client.ts','utf8'),key=source.match(/STAGING_FIREBASE_CONFIG = \{\s*apiKey: "([^"]+)"/)[1];
const keys=await request(`https://apikeys.googleapis.com/v2/projects/${number}/locations/global/keys`);
let matched;for(const k of keys.keys||[]){const data=await request(`https://apikeys.googleapis.com/v2/${k.name}/keyString`);if(data.keyString===key){matched=k;break;}}
if(!matched)throw Error('Staging browser key not found');
const config=await request(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`);
const probes=[];for(const referer of ['https://staging.sendmynotes.com/','https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app/']){const r=await fetch('https://identitytoolkit.googleapis.com/v1/projects?key='+key,{headers:{Referer:referer},signal:AbortSignal.timeout(20000)});const d=await r.json();probes.push({referer,status:r.status,error:d.error?.message||null});}
const out={checkedAt:new Date().toISOString(),keyName:matched.name,displayName:matched.displayName,restrictions:matched.restrictions,etag:matched.etag,authorizedDomains:config.authorizedDomains,probes};fs.writeFileSync(__dirname+'/before.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1});
