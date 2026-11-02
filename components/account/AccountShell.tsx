"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Feather, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';
import './account.css';

const destinations = [
  { href: '/account', label: 'Overview' },
  { href: '/account/history', label: 'Card history' },
  { href: '/account/images', label: 'Saved images' },
  { href: '/account/people', label: 'Address book' },
  { href: '/account/dates', label: 'Dates & reminders' },
  { href: '/account/drafts', label: 'Drafts' },
  { href: '/account/settings', label: 'Settings' },
];

export default function AccountShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut, sendVerificationEmail, reloadUserAndRefreshToken } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [verificationCooldownUntil, setVerificationCooldownUntil] = useState(0);
  const [cooldownNow, setCooldownNow] = useState(0);
  useEffect(() => {
    if (!verificationCooldownUntil) return;
    const tick = () => { const now=Date.now();setCooldownNow(now);if(now>=verificationCooldownUntil)setVerificationCooldownUntil(0); }; tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [verificationCooldownUntil]);

  if (loading) return <main className="account-loading"><div className="account-loading-mark"><Feather aria-hidden="true" /></div><p>Opening your account…</p></main>;
  // Firebase's hosted action handler may return here signed out. Verification
  // itself is a public continuation page; it must remain reachable without the
  // account shell's usual sign-in gate.
  if (!user && pathname === '/account/verify') return <>{children}</>;
  if (!user) return <main className="account-gate"><section className="account-gate-card"><div className="account-loading-mark"><Feather aria-hidden="true" /></div><h1>Sign in to your account</h1><p>Review your cards, keep the people you care about close, and make your next note a little easier.</p><button className="account-button account-button-primary" onClick={() => setAuthOpen(true)}>Sign in</button><Link className="account-text-link" href="/">Return to SendMyNotes</Link><AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} /></section></main>;

  const nav = <nav className="account-nav" aria-label="Account pages">{destinations.map(item => {
    const active = item.href === '/account' ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} onClick={() => setMobileOpen(false)}>{item.label}</Link>;
  })}</nav>;

  return <div className="account-app">
    <header className="account-topbar"><Link href="/account" className="account-brand"><span className="account-brand-mark"><Feather aria-hidden="true" /></span><span><b>SendMyNotes</b><small>Your account</small></span></Link><div className="account-topbar-user"><span title={user.email || 'Signed-in account'}>{user.email || 'Signed-in account'}</span><button className="account-quiet-button" onClick={async () => { setSignOutError(''); try { await signOut(); } catch (e) { setSignOutError(e instanceof Error ? e.message : 'Could not sign out.'); } }}>Sign out</button></div><button className="account-mobile-toggle" aria-label={mobileOpen ? 'Close Account pages' : 'Open Account pages'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}>{mobileOpen ? <X /> : <Menu />}</button></header>
    <div className="account-frame"><aside className="account-sidebar">{nav}<div className="account-sidebar-note">A thoughtful gesture,<br />made seamless.</div></aside><main className="account-main">{signOutError && <p role="alert" className="account-alert">{signOutError}</p>}{!user.emailVerified && <section className="account-alert" aria-labelledby="verify-email-title"><h2 id="verify-email-title">Verify your email</h2><p>Some account actions need a verified email. Your saved work stays here while you verify.</p>{verificationMessage&&<p role="status">{verificationMessage}</p>}<div className="account-toolbar"><button className="account-button" disabled={verificationBusy||cooldownNow<verificationCooldownUntil} onClick={async()=>{setVerificationBusy(true);setVerificationMessage('');try{await sendVerificationEmail(`${window.location.pathname}${window.location.search}`);setVerificationCooldownUntil(Date.now()+60000);setCooldownNow(Date.now());setVerificationMessage('Verification email sent. Check your inbox or spam folder.');}catch(e){setVerificationMessage(e instanceof Error?e.message:'The verification email could not be sent.');}finally{setVerificationBusy(false);}}}>{verificationBusy?'Sending…':cooldownNow<verificationCooldownUntil?`Try again in ${Math.ceil((verificationCooldownUntil-cooldownNow)/1000)}s`:'Send verification email'}</button><button className="account-button" disabled={verificationBusy} onClick={async()=>{setVerificationBusy(true);setVerificationMessage('');try{const refreshed=await reloadUserAndRefreshToken();setVerificationMessage(refreshed.emailVerified?'Email verified. Your account is refreshed.':'We have not received verification yet. Open the link in your email, then try again.');}catch(e){setVerificationMessage(e instanceof Error?e.message:'Your account could not be refreshed.');}finally{setVerificationBusy(false);}}}>I’ve verified</button></div></section>}<div key={user.uid} className="account-user-content">{children}</div></main></div>
    {mobileOpen && <div className="account-mobile-nav">{nav}<div className="account-mobile-identity"><span title={user.email || 'Signed-in account'}>{user.email || 'Signed-in account'}</span><button className="account-quiet-button" onClick={async () => { setSignOutError(''); try { await signOut(); setMobileOpen(false); } catch (e) { setSignOutError(e instanceof Error ? e.message : 'Could not sign out.'); } }}>Sign out</button></div></div>}
  </div>;
}
