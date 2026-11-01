"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Feather, Menu, X } from 'lucide-react';
import { useState } from 'react';
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
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  if (loading) return <main className="account-loading"><div className="account-loading-mark"><Feather aria-hidden="true" /></div><p>Opening your account…</p></main>;
  if (!user) return <main className="account-gate"><section className="account-gate-card"><div className="account-loading-mark"><Feather aria-hidden="true" /></div><h1>Sign in to your account</h1><p>Review your cards, keep the people you care about close, and make your next note a little easier.</p><button className="account-button account-button-primary" onClick={() => setAuthOpen(true)}>Sign in</button><Link className="account-text-link" href="/">Return to SendMyNotes</Link><AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} /></section></main>;

  const nav = <nav className="account-nav" aria-label="Account pages">{destinations.map(item => {
    const active = item.href === '/account' ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
    return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} onClick={() => setMobileOpen(false)}>{item.label}</Link>;
  })}</nav>;

  return <div className="account-app">
    <header className="account-topbar"><Link href="/account" className="account-brand"><span className="account-brand-mark"><Feather aria-hidden="true" /></span><span><b>SendMyNotes</b><small>Your account</small></span></Link><div className="account-topbar-user"><span title={user.email || 'Signed-in account'}>{user.email || 'Signed-in account'}</span><button className="account-quiet-button" onClick={async () => { setSignOutError(''); try { await signOut(); } catch (e) { setSignOutError(e instanceof Error ? e.message : 'Could not sign out.'); } }}>Sign out</button></div><button className="account-mobile-toggle" aria-label={mobileOpen ? 'Close Account pages' : 'Open Account pages'} aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}>{mobileOpen ? <X /> : <Menu />}</button></header>
    <div className="account-frame"><aside className="account-sidebar">{nav}<div className="account-sidebar-note">A thoughtful gesture,<br />made seamless.</div></aside><main className="account-main">{signOutError && <p role="alert" className="account-alert">{signOutError}</p>}<div key={user.uid} className="account-user-content">{children}</div></main></div>
    {mobileOpen && <div className="account-mobile-nav">{nav}<div className="account-mobile-identity"><span title={user.email || 'Signed-in account'}>{user.email || 'Signed-in account'}</span><button className="account-quiet-button" onClick={async () => { setSignOutError(''); try { await signOut(); setMobileOpen(false); } catch (e) { setSignOutError(e instanceof Error ? e.message : 'Could not sign out.'); } }}>Sign out</button></div></div>}
  </div>;
}
