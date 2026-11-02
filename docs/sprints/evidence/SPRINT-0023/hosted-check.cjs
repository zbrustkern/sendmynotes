// Read-only staging checks. Never writes grants, creates orders, or logs cookies/keys.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base='https://staging.sendmynotes.com',project='sendmynotes-staging';
(async()=>{
 const token=cp.execFileSync('/Users/zeke/Downloads/google-cloud-sdk/bin/gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const response=await fetch(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/admin-session-signing-key/versions/latest:access`,{headers:{Authorization:'Bearer '+token}});assert(response.ok,'staging signing key read');const secret=await response.json(),key=Buffer.from(secret.payload.data,'base64').toString().trim();
 const checks=[];
 for(const email of ['zbrustkern@gmail.com','sentral@gmail.com']){
  const payload='smn_admin_google_'+Date.now()+'_'+Buffer.from(email).toString('hex');const cookie=payload+'.'+crypto.createHmac('sha256',key).update(payload).digest('hex');
  for(const route of ['/api/admin/auth','/api/admin/upload-access','/api/admin/upload-standards']){
   const r=await fetch(base+route,{headers:{Cookie:'smn_admin_session='+cookie},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,email+' '+route);checks.push({identity:email,path:route,status:r.status});
  }
 }
 for(const route of ['/api/admin/upload-access','/api/admin/upload-standards','/api/upload/access']){const r=await fetch(base+route,{signal:AbortSignal.timeout(30000)});assert.equal(r.status,401,route+' requires authentication');checks.push({identity:'signed-out',path:route,status:r.status});}
 const client=fs.readFileSync('lib/firebase-client.ts','utf8'),apiKey=client.match(/STAGING_FIREBASE_CONFIG = \{\s*apiKey: "([^"]+)"/)[1];
 const config=await fetch('https://identitytoolkit.googleapis.com/v1/projects?key='+apiKey,{headers:{Referer:base+'/'}});assert.equal(config.status,200);checks.push({path:'Firebase custom-domain auth configuration',status:config.status});
 fs.writeFileSync(__dirname+'/checks/hosted.json',JSON.stringify({checkedAt:new Date().toISOString(),passed:true,base,checks,readOnly:true,grantWrites:0,ordersCreated:0,credentialsLogged:false,limit:'Signed administrator sessions validate server capabilities; actual personal Google login is not automated.'},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,base}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
