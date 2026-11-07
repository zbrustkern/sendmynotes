import os,sys,subprocess,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[4]
env={k:os.environ[k] for k in ['PATH','HOME','TMPDIR','LANG','USER'] if k in os.environ}
env.update(RESEND_API_KEY='re_mock_sprint0028_no_delivery',NODE_ENV='test',USE_MOCK_FIRESTORE='true',ACCOUNT_REMINDER_DELIVERY_ACTIVE='false',ALLOW_LOCAL_MOCK_PAYMENTS='true',NEXT_TELEMETRY_DISABLED='1',NODE_OPTIONS='--require='+str(root/'tests/support/deny-external-network.cjs'))
for test in sys.argv[1:]:
 with tempfile.TemporaryDirectory(prefix='smn28-tests-') as tmp:
  env['SMN_TEST_DATA_DIR']=tmp
  print('RUN',test,flush=True)
  r=subprocess.run(['node','--import','tsx',test],cwd=root,env=env,timeout=90)
  if r.returncode:sys.exit(r.returncode)

print("ALL REQUESTED SUITES PASSED",flush=True)
