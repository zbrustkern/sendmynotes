import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const tests=['account-builder','account-order-association','account-routes-security','account-preferences','account-privacy-requests','account-history','account-list-contract','legacy-reminder-retirement','account-library-drafts','sprint-0024-people-reminders','draft','upload-checkout','upload-routes-security','optional-account-menu'];
let failed=false;
for(const name of tests){
  const dir=mkdtempSync(join(tmpdir(),'smn-s24-'));
  const env={...process.env,NODE_ENV:'test',SMN_TEST_DATA_DIR:dir,USE_MOCK_FIRESTORE:'true',ACCOUNT_REMINDER_DELIVERY_ACTIVE:'false',NODE_OPTIONS:`--require=${resolve('tests/support/deny-external-network.cjs')}`};
  for(const key of Object.keys(env))if(/SECRET|TOKEN|CREDENTIAL|API_KEY|SERVICE_ACCOUNT/i.test(key))delete env[key];
  console.log(`\nRunning ${name}`);
  const result=spawnSync(process.execPath,['--import','tsx',`tests/${name}.test.ts`],{env,stdio:'inherit'});
  rmSync(dir,{recursive:true,force:true});
  if(result.status!==0){failed=true;console.error(`${name} failed (${result.status})`);}
}
if(failed)process.exitCode=1;else console.log('\nAccount sprint and related regression suites passed.');
