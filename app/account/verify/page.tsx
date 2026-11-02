'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { applyActionCode, checkActionCode } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { hostedVerificationResult, safeVerificationReturnTo } from '@/lib/account/verification';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/AuthModal';

type VerificationResult={email:string;hosted:boolean};
function VerificationContent() {
  const search = useSearchParams(); const router = useRouter();
  const { user, reloadUserAndRefreshToken } = useAuth();
  const [status, setStatus] = useState<'checking'|'verified'|'sign_in'|'error'>('checking');
  const [message, setMessage] = useState('Checking your verification link…');
  const [authOpen,setAuthOpen]=useState(false);
  const code=search.get('oobCode');const mode=search.get('mode');
  const returnTo = safeVerificationReturnTo(search.get('returnTo'), typeof window === 'undefined' ? 'https://sendmynotes.com' : window.location.origin);
  const actionRef=useRef<{code:string;promise:Promise<VerificationResult>}|null>(null);
  const processedCode=useRef('');const verifiedEmail=useRef('');
  const redirectTimer=useRef<number|undefined>(undefined);

  useEffect(()=>()=>{if(redirectTimer.current!==undefined)window.clearTimeout(redirectTimer.current)},[]);
  useEffect(() => {
    let active = true;
    const finishForSignedInOwner=async()=>{
      const actor=user;if(!actor)return false;
      const refreshed=await reloadUserAndRefreshToken();
      if(!active)return true;
      if(!refreshed.emailVerified)return false;
      setStatus('verified');setMessage('Your email is verified. Returning to your saved work…');
      if(redirectTimer.current!==undefined)window.clearTimeout(redirectTimer.current);
      redirectTimer.current=window.setTimeout(()=>{if(active)router.replace(returnTo)},700);
      return true;
    };

    // A cached action result lets React StrictMode and auth-context rerenders
    // subscribe to one check/apply operation without applying the code twice.
    if(code&&processedCode.current===code){
      if(user&&verifiedEmail.current&&user.email?.trim().toLowerCase()===verifiedEmail.current){void finishForSignedInOwner().then(done=>{if(active&&!done){setStatus('error');setMessage('Your sign-in email has not refreshed as verified yet. Open the verification link, then try again.')}}).catch(()=>{if(active){setStatus('error');setMessage('Your account could not be refreshed. Sign in again, then retry.')}})}
      else if(active){setStatus('verified');setMessage('Your email is verified. Sign in with that email to continue to your saved work.')}
      return()=>{active=false};
    }

    if(code&&mode==='verifyEmail'){
      if(!actionRef.current||actionRef.current.code!==code){
        const auth=getFirebaseAuth();
        const promise=(async()=>{const info=await checkActionCode(auth,code);const email=info.data.email?.trim().toLowerCase()||'';await applyActionCode(auth,code);return {email,hosted:false};})();
        actionRef.current={code,promise};
      }
      const pending=actionRef.current.promise;
      void pending.then(async result=>{
        processedCode.current=code;verifiedEmail.current=result.email;
        if(!active)return;
        if(user&&result.email&&user.email?.trim().toLowerCase()===result.email){const refreshed=await reloadUserAndRefreshToken();if(!active)return;if(refreshed.emailVerified){setStatus('verified');setMessage('Your email is verified. Returning to your saved work…');redirectTimer.current=window.setTimeout(()=>{if(active)router.replace(returnTo)},700);return;}}
        setStatus('verified');setMessage('Your email is verified. Sign in with that email to continue to your saved work.');
      }).catch(error=>{if(!active)return;const errorCode=(error as {code?:string})?.code;setStatus('error');setMessage(errorCode==='auth/expired-action-code'||errorCode==='auth/invalid-action-code'?'This verification link has expired or was already used. Sign in to request a fresh link.':'We could not verify this link. Sign in and request another verification email.');});
      return()=>{active=false};
    }

    if(code){setStatus('error');setMessage('This verification link is not valid for email confirmation. Sign in to request a fresh link.');return()=>{active=false};}

    // The Firebase hosted action page consumes the code, then redirects to the
    // continue URL without the original oobCode. Recheck only a signed-in user;
    // when signed out, ask them to sign in and never claim success without proof.
    if(user){
      void finishForSignedInOwner().then(done=>{if(!active)return;const result=hostedVerificationResult(true,done);if(result==='verified')return;setStatus('error');setMessage('Firebase returned you here, but this account is not verified yet. Open the email link, then refresh this page.');}).catch(()=>{if(active){setStatus('error');setMessage('Your sign-in could not be refreshed. Sign in again to check verification.')}});
    }else{
      setStatus('sign_in');setMessage('The email link has returned to SendMyNotes. Sign in with the address you verified to continue to your saved work.');
    }
    return()=>{active=false};
  },[code,mode,router,returnTo,reloadUserAndRefreshToken,user?.uid,user?.email]);

  return <main className="account-gate"><section className="account-gate-card"><div className="account-loading-mark" aria-hidden="true">✉</div><h1>{status==='verified'?'Email verified':status==='sign_in'?'Sign in to continue':status==='error'?'Verification needs attention':'Checking your email'}</h1><p role={status==='error'?'alert':'status'}>{message}</p>{status!=='checking'&&<div className="account-toolbar">{status==='sign_in'?<button className="account-button account-button-primary" onClick={()=>setAuthOpen(true)}>Sign in</button>:<button className="account-button account-button-primary" onClick={()=>router.replace(user?.emailVerified?returnTo:'/account')}>{user?.emailVerified?'Continue':'Go to account'}</button>}<a className="account-button" href="/">Return to SendMyNotes</a></div>}</section><AuthModal isOpen={authOpen} onClose={()=>setAuthOpen(false)} title="Sign in to continue" subtitle="Use the email address you just verified to open your saved work." /></main>;
}

export default function AccountVerificationPage() {
  return <Suspense fallback={<main className="account-loading"><p>Opening verification…</p></main>}><VerificationContent /></Suspense>;
}
