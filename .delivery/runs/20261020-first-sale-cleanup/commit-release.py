"""Commit only reviewed source paths in one isolated release checkout."""
from pathlib import Path
import json
import subprocess
import sys

variant = sys.argv[1]
assert variant in ('production', 'staging')
run = Path(__file__).resolve().parent
scope = json.loads((run / 'checks/release-scope.json').read_text())[variant]
root = Path('/Users/zeke/.codex/worktrees') / ('first-sale-cleanup' if variant == 'production' else 'first-sale-staging') / 'sendmynotes'
def git(*args):
    return subprocess.run(['git', *args], cwd=root, check=True, capture_output=True, text=True).stdout.strip()
expected = 'c7c127e3e184252d0c727df715dd18e8e30129f6' if variant == 'production' else '844b2bfe4c06e9fd617288bcfa1f4f8fdce7bbd3'
assert git('rev-parse', 'HEAD') == expected, 'Base changed'
assert git('diff', '--name-only').splitlines() == scope['changed_paths'], 'Unreviewed file changes'
assert not git('diff', '--cached', '--name-only'), 'Unexpected staged files'
git('diff', '--check')
git('switch', '-c', 'codex/first-sale-cleanup' + ('-staging' if variant == 'staging' else ''))
git('add', '--', *scope['changed_paths'])
print(git('commit', '-m', 'fix(copy): clarify custom artwork and verified card details'))
sha = git('rev-parse', 'HEAD')
(run / f'checks/{variant}-commit.json').write_text(json.dumps({'commit': sha, 'parent': expected, 'paths': scope['changed_paths']}, indent=2) + '\n')
print(json.dumps({'variant': variant, 'commit': sha}))
