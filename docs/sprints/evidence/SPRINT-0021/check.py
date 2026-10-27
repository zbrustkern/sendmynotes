"""Run isolated, network-denied regression/build checks; never load live credentials."""
from pathlib import Path
import json, os, subprocess, sys, tempfile

root = Path(__file__).resolve().parents[4]
evidence = Path(__file__).parent / 'checks'
evidence.mkdir(exist_ok=True)
guard = root / '.delivery/runs/20261020-first-sale-cleanup/deny-network.cjs'
mode = sys.argv[1]
commands = {
    'focused': [['node', '--import', 'tsx', 'tests/'+name] for name in [
        'envelope-preview.test.tsx', 'sprint-0019-ux.test.ts',
        'international-addressing-ui.test.tsx', 'international-pricing.test.ts',
        'draft.test.ts', 'scenario-draft-seeding.test.ts',
        'staging-polish.test.tsx', 'render-auto-select.test.tsx',
        'staging-review-safety.test.ts', 'sprint-0021-visual.test.tsx',
        'checkout-contact-policy.test.ts', 'checkout-contact-route.integration.test.ts', 'payment-mode-safety.test.ts',
        'email-transactional.test.ts', 'transaction-security.test.ts',
        'international-checkout.integration.test.ts']],
    'email': [['node', '--import', 'tsx', 'tests/email-transactional.test.ts']],
    'typecheck': [['node', 'node_modules/typescript/bin/tsc', '--noEmit']],
    'build': [['node', 'node_modules/next/dist/bin/next', 'build']],
    'dev': [['node', 'node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3130']],
}
if mode not in commands: raise SystemExit('Unknown check mode')
with tempfile.TemporaryDirectory(prefix='smn-checkout-check-') as temp:
    env = {'PATH':'/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin', 'TMPDIR':temp,
           'NODE_ENV':'development' if mode=='dev' else 'production' if mode=='build' else 'test',
           'RESEND_API_KEY':'re_mock_checkout', 'USE_MOCK_FIRESTORE':'true',
           'STAGING_REVIEW_ONLY':'true', 'NEXT_PUBLIC_STAGING_REVIEW_ONLY':'true',
           'HANDWRYTTEN_TEST_MODE':'true', 'NEXT_PUBLIC_APP_URL':'http://127.0.0.1:3130',
           'NODE_OPTIONS':'--require='+str(guard), 'NEXT_TELEMETRY_DISABLED':'1'}
    results=[]
    for i, command in enumerate(commands[mode]):
        name=Path(command[-1]).name if mode=='focused' else mode
        with (evidence/(name+'.log')).open('w') as output:
            check_env = dict(env)
            check_env['SMN_TEST_DATA_DIR'] = str(Path(temp) / ('mock-' + str(i)))
            if name == 'email-transactional.test.ts' or mode == 'email': check_env['STAGING_REVIEW_ONLY'] = 'false'  # mock key + network guard still prevent delivery
            result=subprocess.run(command,cwd=root,env=check_env,stdout=output,stderr=subprocess.STDOUT,timeout=1800 if mode=='dev' else 600)
        results.append({'check':name,'exitCode':result.returncode})
        print(name+': '+str(result.returncode),flush=True)
        if result.returncode: print((evidence/(name+'.log')).read_text()[-4000:],flush=True)
    (evidence/(mode+'-results.json')).write_text(json.dumps(results,indent=2)+'\n')
    raise SystemExit(any(x['exitCode'] for x in results))
