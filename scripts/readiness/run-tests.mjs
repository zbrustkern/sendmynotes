import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const defaults=['artwork-recovery','payment-mode-safety','checkout-contact-policy','checkout-contact-route.integration','international-checkout.integration','admin-comp-adversarial','telemetry-ingestion','google-purchase-measurement','google-attribution-queue'];
const tests=process.argv.slice(2).length?process.argv.slice(2):defaults;
let failed=false;
for(const name of tests){
 if(!/^[a-z0-9-]+(?:\.integration)?$/.test(name))throw Error('Invalid test name');
 const dir=mkdtempSync(join(tmpdir(),'smn-s25-'));
 const env={...process.env,NODE_ENV:'test',SMN_TEST_DATA_DIR:dir,USE_MOCK_FIRESTORE:'true',ACCOUNT_REMINDER_DELIVERY_ACTIVE:'false',NODE_OPTIONS:`--require=${resolve('tests/support/deny-external-network.cjs')}`};
 for(const key of Object.keys(env))if(/SECRET|TOKEN|CREDENTIAL|API_KEY|SERVICE_ACCOUNT/i.test(key))delete env[key];
 env.RESEND_API_KEY='re_mock_readiness_never_deliver';
 console.log(`Running ${name}`);
 const result=spawnSync(process.execPath,['--import','tsx',`tests/${name}.test.ts`],{env,stdio:'inherit',timeout:120000});
 rmSync(dir,{recursive:true,force:true});
 if(result.status!==0){failed=true;console.error(`${name} failed (${result.status})`);}
}
if(failed)process.exitCode=1;else console.log('All selected readiness regressions passed.');
