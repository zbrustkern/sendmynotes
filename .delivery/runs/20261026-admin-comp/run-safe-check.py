#!/usr/bin/env python3
"""Run a named TS regression with isolated disk mocks and external networking denied."""
import os, pathlib, subprocess, sys, tempfile
root=pathlib.Path(__file__).resolve().parents[3]
name=sys.argv[1]
source=(root/'tests'/name).resolve()
if not source.is_relative_to(root/'tests') or not source.is_file(): raise SystemExit('Unknown test')
logs=pathlib.Path(__file__).parent/'checks';logs.mkdir(exist_ok=True)
env={'PATH':'/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin','NODE_ENV':'test','RESEND_API_KEY':'re_mock_admin_comp','NODE_OPTIONS':'--require='+str(root/'.delivery/runs/20261020-first-sale-cleanup/deny-network.cjs')}
with tempfile.TemporaryDirectory(prefix='smn-comp-check-') as work:
 env['TMPDIR']=work
 env['TSX_TSCONFIG_PATH']=str(root/'tsconfig.json')
 result=subprocess.run(['/opt/homebrew/bin/node','--import',str(root/'node_modules/tsx/dist/loader.mjs'),str(source)],cwd=work,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=180)
 (logs/(source.name+'.log')).write_text(result.stdout)
 print(name+': exit '+str(result.returncode))
 print(result.stdout[-1600:])
 raise SystemExit(result.returncode)
