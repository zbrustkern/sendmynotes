import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'smn-wedding-core-'));
const env={...process.env,NODE_ENV:'test',SMN_TEST_DATA_DIR:dir,NODE_OPTIONS:`--require=${resolve('tests/support/deny-external-network.cjs')}`};
for(const key of Object.keys(env))if(/SECRET|TOKEN|CREDENTIAL|API_KEY|SERVICE_ACCOUNT|FIREBASE|GOOGLE_CLOUD|GCLOUD|K_SERVICE/i.test(key))delete env[key];
try{const result=spawnSync(process.execPath,['--import','tsx','tests/wedding-core.test.ts'],{env,stdio:'inherit'});process.exitCode=result.status??1;}finally{rmSync(dir,{recursive:true,force:true});}
