// Scoped repair: only the audited staging hostname in the verified test account.
const cp=require('node:child_process'),fs=require('node:fs'),crypto=require('node:crypto');
const domain='sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app';
async function main(){
 const token=cp.execFileSync('/Users/zeke/Downloads/google-cloud-sdk/bin/gcloud',['auth','print-access-token'],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
 const r=await fetch('https://secretmanager.googleapis.com/v1/projects/sendmynotes-staging/secrets/stripe-secret-key/versions/1:access',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Credential read failed');
 const key=Buffer.from((await r.json()).payload.data,'base64').toString().trim();
 const baseline=JSON.parse(fs.readFileSync(__dirname+'/stripe-staging-runtime.json'));
 if(!key.startsWith('sk_test_')||crypto.createHash('sha256').update(key).digest('hex')!==baseline.stripeSecretProvenance.valueSha256)throw Error('Test credential baseline mismatch');
 const call=async(path,method='GET',body)=>{const r=await fetch('https://api.stripe.com/v1/'+path,{method,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/x-www-form-urlencoded'},...(body?{body:new URLSearchParams(body)}:{}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('Stripe request failed '+r.status);return r.json()};
 const before=await call('payment_method_domains?limit=100');let entry=before.data.find(x=>x.domain_name===domain);const created=!entry;
 if(!entry)entry=await call('payment_method_domains','POST',{domain_name:domain});
 if(entry.livemode||entry.domain_name!==domain)throw Error('Unexpected domain response');
 const out={checkedAt:new Date().toISOString(),created,id:entry.id,domain,enabled:entry.enabled,livemode:entry.livemode,applePay:entry.apple_pay?.status,googlePay:entry.google_pay?.status,link:entry.link?.status,productionChanged:false};
 fs.writeFileSync(__dirname+'/checks/domain-repair.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
