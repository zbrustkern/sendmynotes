const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),admin=require('firebase-admin');
const mode=process.argv[2]||'setup',project='sendmynotes-staging',uid='sprint22-upload-test',email='sprint22-upload-test@example.test';
process.env.GOOGLE_CLOUD_QUOTA_PROJECT=project;
const file='.data/upload-staging-fixture.json';
async function main(){const token=cp.execFileSync('/Users/zeke/Downloads/google-cloud-sdk/bin/gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();admin.initializeApp({projectId:project,credential:{getAccessToken:async()=>({access_token:token,expires_in:3600})}});
if(mode==='cleanup'){await admin.auth().deleteUser(uid).catch(e=>{if(e.code!=='auth/user-not-found')throw e});console.log('Synthetic Firebase user deleted');return;}
const password=crypto.randomBytes(24).toString('base64url');
try{await admin.auth().createUser({uid,email,password,emailVerified:true,displayName:'Upload QA'});}catch(e){if(e.code!=='auth/uid-already-exists'&&e.code!=='auth/email-already-exists')throw e;await admin.auth().updateUser(uid,{password,emailVerified:true});}
const client=fs.readFileSync('lib/firebase-client.ts','utf8');const apiKey=client.match(/STAGING_FIREBASE_CONFIG = \{\s*apiKey: "([^"]+)"/)[1];
const response=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+apiKey,{method:'POST',headers:{'Content-Type':'application/json',Referer:'https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app/'},body:JSON.stringify({email,password,returnSecureToken:true})});const data=await response.json();if(!response.ok)throw Error('Synthetic sign-in: '+data.error?.message);
const secret=await fetch(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/admin-session-signing-key/versions/latest:access`,{headers:{Authorization:'Bearer '+token}});if(!secret.ok)throw Error('Admin fixture signing access '+secret.status);const record=await secret.json();const key=Buffer.from(record.payload.data,'base64').toString().trim();
const payload='smn_admin_google_'+Date.now()+'_'+Buffer.from('zbrustkern@gmail.com').toString('hex');const cookie=payload+'.'+crypto.createHmac('sha256',key).update(payload).digest('hex');
fs.mkdirSync('.data',{recursive:true});fs.writeFileSync(file,JSON.stringify({uid,email,idToken:data.idToken,refreshToken:data.refreshToken,apiKey,cookie,expiresAt:Date.now()+3500000}),{mode:0o600});console.log(JSON.stringify({syntheticUserReady:true,project,credentialsLogged:false}));}
main().catch(e=>{console.error(e.code||'error',String(e.message).replace(/AIza[\w-]+/g,'[redacted]'));process.exitCode=1});
