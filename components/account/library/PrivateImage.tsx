'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

export function PrivateImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const { user } = useAuth(); const [url, setUrl] = useState(''); const [failed, setFailed] = useState(false); const uid = user?.uid || '';
  useEffect(() => {
    setUrl(''); setFailed(false); if (!user) return; let active = true; let objectUrl = '';
    void user.getIdToken().then(token => fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })).then(async response => {
      if (!response.ok) throw new Error('private_image_unavailable'); const blob = await response.blob(); if (!active) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, uid, user]);
  if (failed) return <div role="img" aria-label={`${alt}. Preview unavailable.`} className={`flex items-center justify-center bg-stone-100 text-xs text-stone-500 ${className || ''}`}>Preview unavailable</div>;
  return url ? <img src={url} alt={alt} className={className} /> : <div role="status" className={`animate-pulse bg-stone-100 ${className || ''}`} aria-label="Loading private image preview" />;
}
