import { NextRequest } from 'next/server';

/** Compare scheme, host, and port using proxy-aware request metadata. */
export function isSameOrigin(req: NextRequest): boolean {
  try {
    const origin=req.headers.get('origin');
    const host=(req.headers.get('x-forwarded-host')||req.headers.get('host')||'').split(',')[0].trim();
    const proxyProto=req.headers.get('x-forwarded-proto')?.split(',')[0].trim();
    const requestProto=proxyProto||new URL(req.url).protocol.replace(':','');
    if(!origin||!host||!['http','https'].includes(requestProto.toLowerCase()))return false;
    const supplied=new URL(origin);
    if(supplied.username||supplied.password||supplied.pathname!=='/'||supplied.search||supplied.hash)return false;
    return supplied.origin===new URL(`${requestProto.toLowerCase()}://${host}`).origin;
  } catch { return false; }
}
