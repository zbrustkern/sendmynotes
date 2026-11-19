// Operator setup for a short-lived synthetic guest pilot. Uses staging IAM,
// exercises the normal single-use invite redemption and never creates a web admin.
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {writeFile,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
const path = resolve(process.argv[2] || '');
if (![resolve(tmpdir()),'/private/tmp','/tmp'].includes(dirname(path)) || !/^smn-wedding-[a-z0-9-]+\.private$/.test(path.split('/').pop())) {
  throw new Error('Supply a new smn-wedding-*.private file in the local temp directory.');
}
const project='sendmynotes-staging';
const token=execFileSync('gcloud',['auth','print-access-token'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const proof=randomBytes(32).toString('hex'),id=createHash('sha256').update(proof).digest('hex');
const prefix='projects/'+project+'/databases/(default)/documents/';
const at=Date.now(),expiresAt=at+6*3600000;
const encode=v=>v===null?{nullValue:null}:typeof v==='number'?{integerValue:String(v)}:typeof v==='boolean'?{booleanValue:v}:{stringValue:v};
const doc=(collection,values)=>({update:{name:prefix+collection+'/'+id,fields:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,encode(v)]))},currentDocument:{exists:false}});
await writeFile(path,'https://staging.sendmynotes.com/thank-you/wedding#wedding='+proof+'\n',{mode:0o600,flag:'wx'});
try {
  const r=await fetch('https://firestore.googleapis.com/v1/projects/'+project+'/databases/(default)/documents:commit',{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','x-goog-user-project':project},
    body:JSON.stringify({writes:[
      doc('weddingInvites',{id,kind:'pilot',actorId:'staging-qa-operator',projectId:null,householdId:null,createdAt:at,expiresAt,consumedAt:null,revoked:false}),
      doc('weddingPilotAudit',{actorId:'staging-qa-operator',action:'issued_synthetic_guest_test',projectId:null,at}),
    ]}),
  });
  if (!r.ok) throw new Error('Staging synthetic invite creation returned HTTP '+r.status);
} catch(error) {
  await unlink(path);
  throw error;
}
console.log('Created single-use staging test invite in the private file; expires in six hours.');
