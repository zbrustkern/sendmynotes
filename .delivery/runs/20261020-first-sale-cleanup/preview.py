"""Serve the verified local production build with secrets removed and network denied."""
from pathlib import Path
import os
import subprocess

run = Path(__file__).resolve().parent
env = os.environ.copy()
for key in list(env):
    if any(token in key for token in ['STRIPE', 'FIREBASE', 'GOOGLE', 'HANDWRYTTEN', 'RESEND', 'META_', 'GEMINI', 'K_SERVICE']):
        env.pop(key, None)
env.update(NODE_ENV='production', NEXT_TELEMETRY_DISABLED='1', NEXT_PUBLIC_STAGING_REVIEW_ONLY='true', STAGING_REVIEW_ONLY='true', NODE_OPTIONS=f'--require {run / "deny-network.cjs"}')
raise SystemExit(subprocess.run(['node', 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3312'], cwd='/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes', env=env).returncode)
