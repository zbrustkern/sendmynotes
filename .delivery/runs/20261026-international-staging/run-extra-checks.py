from pathlib import Path
import os, subprocess, tempfile, sys
root=Path(__file__).resolve().parents[3]
checks=root/'.delivery/runs/20261026-international-staging/checks'
checks.mkdir(exist_ok=True)
suites=['international-pricing.test.ts','international-checkout.integration.test.ts','international-addressing-ui.test.tsx','draft.test.ts','email-transactional.test.ts','feature-flags.test.ts','delivery-estimate.test.ts']
failed=[]
for suite in suites:
 with tempfile.TemporaryDirectory(prefix='smn-international-check-') as cwd:
  env={'PATH':os.environ['PATH'],'NODE_ENV':'test','TSX_TSCONFIG_PATH':str(root/'tsconfig.json'),'RESEND_API_KEY':'re_mock_release_gate','NODE_OPTIONS':'--require='+str(root/'.delivery/runs/20261020-first-sale-cleanup/deny-network.cjs')}
  result=subprocess.run(['node','--import',str(root/'node_modules/tsx/dist/loader.mjs'),str(root/'tests'/suite)],cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=90)
  (checks/(suite+'.log')).write_text(result.stdout)
  print(suite, 'PASS' if result.returncode==0 else 'FAIL', flush=True)
  if result.returncode: failed.append(suite); print(result.stdout[-2500:])
sys.exit(bool(failed))
