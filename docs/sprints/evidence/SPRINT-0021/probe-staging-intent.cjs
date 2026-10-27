// Creates one unpaid synthetic test checkout; never confirms payment or fulfillment.
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
async function main(){
 const token=cp.execFileSync('/Users/zeke/Downloads/google-cloud-sdk/bin/gcloud',['auth','print-access-token'],{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
 const s=await fetch('https://secretmanager.googleapis.com/v1/projects/sendmynotes-staging/secrets/stripe-secret-key/versions/1:access',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});if(!s.ok)throw Error('Credential read failed');
 const key=Buffer.from((await s.json()).payload.data,'base64').toString().trim();if(!key.startsWith('sk_test_'))throw Error('Test key required');
 const host='https://sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app';
 const response=await fetch(host+'/api/checkout/create-intent',{method:'POST',headers:{'Content-Type':'application/json','Cookie':'smn_founder_device=1'},body:JSON.stringify({frontImageUrl:host+'/images/envelope-preview/envelope-paper.webp',handwrittenNote:'Synthetic staging checkout verification. Do not mail.',fontStyleId:'hwDavid',customerEmail:'',recipientAddress:{firstName:'Alex',lastName:'Sample',street1:'123 Example Lane',city:'Exampleville',state:'IL',zip:'60000',country:'US'},returnAddress:{firstName:'Sam',lastName:'Sample',street1:'456 Return Street',city:'Sampletown',state:'CA',zip:'90000',country:'US'},experienceVersion:'sprint-0021-staging-verification',contactPolicyVersion:1})});
 const body=await response.json();if(!response.ok){console.log({status:response.status,error:body.error});return;}
 const id=body.paymentIntentId || body.clientSecret?.split('_secret_')[0];if(!/^pi_/.test(id))throw Error('Missing intent');
 const sr=await fetch('https://api.stripe.com/v1/payment_intents/'+id,{headers:{Authorization:`Bearer ${key}`}});if(!sr.ok)throw Error('Secret key cannot read synthetic intent');const pi=await sr.json();if(pi.livemode)throw Error('Unexpected live intent');
 const pr=await fetch('https://api.stripe.com/v1/payment_intents/'+id+'?client_secret='+encodeURIComponent(body.clientSecret),{headers:{Authorization:`Bearer ${body.publishableKey}`}});const pub=await pr.json();
 let contactChecks=null;
 if(process.argv.includes('--contact')){
  const commit=async(email,viewToken=body.viewToken)=>{const r=await fetch(host+'/api/checkout/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:body.orderId,viewToken,customerEmail:email})});return {status:r.status,body:await r.json()};};
  const denied=await commit('', 'invalid-test-capability');
  const provided=await commit('sender@example.com');
  const omitted=await commit('');
  const checked=await fetch('https://api.stripe.com/v1/payment_intents/'+id,{headers:{Authorization:`Bearer ${key}`}});const updated=await checked.json();
  contactChecks={invalidCapabilityStatus:denied.status,providedStatus:provided.status,omittedStatus:omitted.status,omittedChoice:omitted.body.contactEmailChoice,stripeReceiptEmailEmpty:!updated.receipt_email,paymentRemainsUnconfirmed:updated.status==='requires_payment_method'};
  if(denied.status!==403||provided.status!==200||omitted.status!==200||updated.receipt_email||updated.status!=='requires_payment_method')throw Error('Hosted contact policy checks failed; no charge attempted');
 }
 const out={contactChecks,checkedAt:new Date().toISOString(),testOnly:true,syntheticIntentId:id,status:pi.status,amount:pi.amount,paymentMethodTypes:pi.payment_method_types,publishableKeyClass:body.publishableKey?.startsWith('pk_test_')?'test':'other',publishableKeyHash:crypto.createHash('sha256').update(body.publishableKey||'').digest('hex'),publishableSecretPairVerified:pr.ok&&pub.id===pi.id,chargeAttempted:false,mailAttempted:false};
 fs.writeFileSync(__dirname+'/checks/intent-probe.json',JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
