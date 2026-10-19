from pathlib import Path
import shutil
src=Path('/Users/zeke/code/sendmynotes');dst=Path('/private/tmp/sendmynotes-takeover-qa')
for name in ['app','components','context','lib','tests']:
 shutil.copytree(src/name,dst/name,dirs_exist_ok=True)
p=dst/'lib/firebase-admin.ts';s=p.read_text();marker='function initializeFirebase() {'
print('marker',marker in s)
if marker not in s:
 idx=s.index('function initialize');print(s[idx:idx+180]);raise SystemExit(1)
s=s.replace(marker,marker+'\n  if (process.env.SMN_ISOLATED_QA === "1") return { db: mockFirestoreInstance as unknown as admin.firestore.Firestore, isMock: true };',1);p.write_text(s)
