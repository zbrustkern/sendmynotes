"""Apply only reviewed copy/layout hunks to the isolated staging checkout."""
from pathlib import Path
import json
import subprocess

run = Path(__file__).resolve().parent
production = Path('/Users/zeke/.codex/worktrees/first-sale-cleanup/sendmynotes')
staging = Path('/Users/zeke/.codex/worktrees/first-sale-staging/sendmynotes')
allowed = {
    'app/admin/page.tsx', 'app/order/[id]/page.tsx', 'app/privacy/page.tsx',
    'app/return-policy/page.tsx', 'app/send/[occasion]/page.tsx', 'app/send/page.tsx',
    'app/terms/page.tsx', 'components/AddressStep.tsx', 'components/CheckoutStep.tsx',
    'components/VendingMachineBuilder.tsx', 'components/admin/HandwryttenStatusWidget.tsx',
    'components/flow/EntryCardStep.tsx', 'components/v3/Step2NoteComposition.tsx',
    'components/v3/Step3EnvelopeAddressing.tsx', 'components/v3/Step4ReviewAndPayment.tsx',
    'components/v3/Step5Confirmation.tsx', 'components/v3/TargetPurchaseExperience.tsx',
    'lib/product-facts.ts',
}
def git(root, *args, **kwargs):
    return subprocess.run(['git', *args], cwd=root, check=True, capture_output=True, **kwargs)
changed = git(production, 'diff', '--name-only', text=True).stdout.splitlines()
assert changed and set(changed) <= allowed, 'Unexpected production scope'
assert not git(staging, 'status', '--porcelain', text=True).stdout.strip(), 'Staging checkout is not clean'
assert git(staging, 'rev-parse', 'HEAD', text=True).stdout.strip() == '844b2bfe4c06e9fd617288bcfa1f4f8fdce7bbd3'
common = [name for name in changed if name not in {'app/admin/page.tsx', 'components/admin/HandwryttenStatusWidget.tsx'}]
patch = git(production, 'diff', '--binary', '--', *common).stdout
git(staging, 'apply', '--check', '-', input=patch)
admin = staging / 'app/admin/page.tsx'
content = admin.read_text()
anchor = '            {/* CANONICAL BASELINE DISCLOSURE BANNER */}'
notice = '''            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950">
              <strong>Founder report — October 20, 2026:</strong> Purchases reviewed to date were founder tests. This dated report does not reconcile live paid totals or visit ratios; those figures alone do not establish independent customer demand.
            </div>
'''
assert content.count(anchor) == 1, 'Staging admin insertion anchor changed'
assert 'Founder report — October 20, 2026:' not in content
assert '100 lb' not in (staging / 'components/admin/HandwryttenStatusWidget.tsx').read_text(), 'Staging widget needs separate review'
git(staging, 'apply', '-', input=patch)
admin.write_text(content.replace(anchor, notice + anchor, 1))
result = {'common_paths': common, 'staging_specific': ['app/admin/page.tsx: added same dated founder report before preserved historical baseline'], 'already_correct': ['components/admin/HandwryttenStatusWidget.tsx: canonical cardstock text already present'], 'no_overhaul_promotion': True}
(run / 'checks/staging-integration.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'changed_common_files': len(common), 'admin_notice': 'added', 'historical_baseline': 'preserved'}))
