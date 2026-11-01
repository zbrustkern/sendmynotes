import { Suspense, type ReactNode } from 'react';
import AccountShell from '@/components/account/AccountShell';

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<main className="account-loading" aria-busy="true">Opening your account…</main>}><AccountShell>{children}</AccountShell></Suspense>;
}
