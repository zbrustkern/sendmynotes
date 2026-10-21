"""Run scoped local checks without project secrets or external provider access."""
from pathlib import Path
import json
import os
import subprocess
import sys
import time

variant = sys.argv[1]
if variant not in ("production", "staging"):
    raise SystemExit("Choose production or staging")
run = Path(__file__).resolve().parent
root = Path('/Users/zeke/.codex/worktrees') / ('first-sale-cleanup' if variant == 'production' else 'first-sale-staging') / 'sendmynotes'
checks = run / 'checks'
checks.mkdir(exist_ok=True)
dependencies = root / 'node_modules'
if not dependencies.exists():
    dependencies.symlink_to('/Users/zeke/code/sendmynotes/node_modules', target_is_directory=True)
if any(root.glob('.env*')):
    unexpected = [p.name for p in root.glob('.env*') if p.name != '.env.example']
    if unexpected:
        raise SystemExit('Refusing checkout containing environment files')
env = os.environ.copy()
for key in list(env):
    if any(token in key for token in ['STRIPE', 'FIREBASE', 'GOOGLE', 'HANDWRYTTEN', 'RESEND', 'META_', 'GEMINI', 'K_SERVICE']):
        env.pop(key, None)
env.update(NODE_ENV='test', NEXT_TELEMETRY_DISABLED='1', NODE_OPTIONS=f'--require {run / "deny-network.cjs"}')
tests = [
    'tests/target-experience.test.ts',
    'tests/staging-polish.test.tsx',
    'tests/auto-select-ad-entry.test.ts' if variant == 'production' else 'tests/root-auto-select.test.tsx',
    'tests/render-auto-select.test.tsx',
    'tests/draft.test.ts',
    'tests/ad-scenarios-routing.test.ts',
    'tests/delivery-estimate.test.ts',
]
results = []
for test in tests:
    started = time.monotonic()
    result = subprocess.run(['node', '--import', 'tsx', test], cwd=root, env=env, capture_output=True, text=True, timeout=120)
    (checks / f'{variant}-{Path(test).stem}.log').write_text(result.stdout + result.stderr)
    row = {'test': test, 'exit_code': result.returncode, 'seconds': round(time.monotonic() - started, 2)}
    results.append(row)
    print(json.dumps(row), flush=True)
    if result.returncode:
        print((result.stdout + result.stderr)[-2400:], flush=True)
(checks / f'{variant}-regressions.json').write_text(json.dumps(results, indent=2) + '\n')
if any(row['exit_code'] for row in results):
    raise SystemExit(1)
env.update(NODE_ENV='production', NEXT_PUBLIC_STAGING_REVIEW_ONLY='true')
started = time.monotonic()
with (checks / f'{variant}-build.log').open('w') as output:
    result = subprocess.run(['node', 'node_modules/next/dist/bin/next', 'build', '--no-lint'], cwd=root, env=env, stdout=output, stderr=subprocess.STDOUT, timeout=240)
row = {'variant': variant, 'exit_code': result.returncode, 'seconds': round(time.monotonic() - started, 2), 'typecheck': 'included in Next build', 'local_only_env': {'NEXT_PUBLIC_STAGING_REVIEW_ONLY': 'true'}, 'external_network': 'denied'}
(checks / f'{variant}-build.json').write_text(json.dumps(row, indent=2) + '\n')
print(json.dumps(row), flush=True)
if result.returncode:
    print((checks / f'{variant}-build.log').read_text()[-4000:])
raise SystemExit(result.returncode)
