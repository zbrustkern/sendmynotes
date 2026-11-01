from pathlib import Path
import subprocess,os,json,time
qa=Path('/private/tmp/sendmynotes-takeover-qa'); logs=qa/'qa-results';logs.mkdir(exist_ok=True)
paths=sorted((qa/'tests').glob('sprint-00*.*test*'))
# Match exact current sprint suites, plus scoped repair and draft regressions.
paths=sorted([p for p in (qa/'tests').glob('sprint-*') if p.suffix in ['.ts','.tsx']])+[qa/'tests/admin-portal-repairs-regression.test.ts',qa/'tests/draft.test.ts',qa/'tests/admin-takeover-reporting.test.ts',qa/'tests/admin-takeover-integration.test.ts']
env=os.environ.copy()
for k in ['GOOGLE_CLOUD_PROJECT','FIREBASE_CONFIG','K_SERVICE','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY']:env.pop(k,None)
env.update(NODE_ENV='test',SMN_ISOLATED_QA='1',NEXT_TELEMETRY_DISABLED='1',NODE_OPTIONS='--require /private/tmp/sendmynotes-takeover-qa/qa-network.cjs')
results=[]
for p in paths:
 if not p.exists():continue
 mock=qa/'.data/mock-firestore.json'
 if mock.exists():mock.write_text('{}')
 t=time.monotonic()
 try:
  run=subprocess.run(['node','--import','tsx',str(p.relative_to(qa))],cwd=qa,env=env,capture_output=True,text=True,timeout=120)
  output=run.stdout+run.stderr; code=run.returncode
 except subprocess.TimeoutExpired as e:output=str(e);code=124
 (logs/(p.name+'.log')).write_text(output)
 row={'test':p.name,'exit_code':code,'duration_seconds':round(time.monotonic()-t,2)};results.append(row)
 print(json.dumps(row),flush=True)
 if code:print(output[-3500:],flush=True)
(logs/'summary.json').write_text(json.dumps(results,indent=2)+'\n')
