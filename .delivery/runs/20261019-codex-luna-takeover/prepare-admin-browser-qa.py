from pathlib import Path
import json
root=Path('/private/tmp/sendmynotes-takeover-qa')
(root/'app/layout.tsx').write_text('''import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
export default function RootLayout({children}: {children: React.ReactNode}) {
 return <html lang="en"><body><div style={{background:"#fef3c7",color:"#78350f",padding:"6px 16px",fontSize:12}}>Isolated QA · synthetic rehearsal data · external services disabled</div><AuthProvider>{children}</AuthProvider></body></html>;
}
''')
p=root/'lib/firebase-client.ts';s=p.read_text().replace('export const getFirebaseAuth = (): Auth => {','export const getFirebaseAuth = (): Auth => {\n  throw new Error("Isolated QA: Firebase client disabled; local passphrase only.");',1);p.write_text(s)
p=root/'.data/mock-firestore.json';data=json.loads(p.read_text());data={key:value for key,value in data.items() if not key.startswith('analytics_replay')}
for key in ['telemetry_events_v2','telemetry_events']:
 if key in data:
  data[key]={identity:event for identity,event in data[key].items() if not str(event.get('session_id',event.get('sessionId',''))).startswith('benchmark_')}
  for event in data[key].values():event['environment']='test'
for fact in data.get('financial_facts',{}).values():fact['livemode']=False
p.write_text(json.dumps(data))
