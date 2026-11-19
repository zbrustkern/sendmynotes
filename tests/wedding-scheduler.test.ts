import assert from 'node:assert/strict';
import { weddingSchedulerAuthorized } from '../lib/wedding/scheduler-auth';

async function main() {
  const env: NodeJS.ProcessEnv & {WEDDING_SCHEDULER_AUDIENCE:string;WEDDING_SCHEDULER_IDENTITY:string} = { NODE_ENV:'test',FIREBASE_PROJECT_ID:'sendmynotes-staging', STAGING_REVIEW_ONLY:'true', WEDDING_CHECKOUT_ENABLED:'true',
    WEDDING_SCHEDULER_AUDIENCE:'https://stage.example/api/cron/wedding-reconcile', WEDDING_SCHEDULER_IDENTITY:'scheduler@stage.example' };
  const request = new Request(env.WEDDING_SCHEDULER_AUDIENCE, {method:'POST',headers:{Authorization:'Bearer sample-token'}});
  const ok = async (token:string, audience:string) => {
    assert.equal(token,'sample-token');
    assert.equal(audience,env.WEDDING_SCHEDULER_AUDIENCE);
    return {email:env.WEDDING_SCHEDULER_IDENTITY, email_verified:true};
  };
  assert.equal(await weddingSchedulerAuthorized(request,env,ok),true);
  assert.equal(await weddingSchedulerAuthorized(request,{...env,STAGING_REVIEW_ONLY:'false'},ok),false);
  assert.equal(await weddingSchedulerAuthorized(request,{...env,WEDDING_CHECKOUT_ENABLED:'false'},ok),true);
  assert.equal(await weddingSchedulerAuthorized(request,env,async()=>({email:'other@stage.example',email_verified:true})),false);
  assert.equal(await weddingSchedulerAuthorized(request,env,async()=>({email:env.WEDDING_SCHEDULER_IDENTITY,email_verified:false})),false);
  assert.equal(await weddingSchedulerAuthorized(request,env,async()=>{throw new Error('unverified');}),false);
  assert.equal(await weddingSchedulerAuthorized(new Request(request.url),env,ok),false);
  console.log('Wedding scheduler identity, audience and staging gates passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
