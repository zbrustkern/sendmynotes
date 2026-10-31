import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredUploads, assertUploadRuntime, uploadErrorResponse } from '@/lib/upload/access';
import { UploadError } from '@/lib/upload/contracts';
export const dynamic='force-dynamic';
export const runtime='nodejs';
function authorized(req:NextRequest) {
  const secret=process.env.UPLOAD_CLEANUP_SECRET?.trim();
  if(!secret && process.env.NODE_ENV==='production') return false;
  if(!secret) return process.env.NODE_ENV!=='production';
  const provided=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const a=Buffer.from(provided),b=Buffer.from(secret);
  return a.length===b.length && a.length>0 && timingSafeEqual(a,b);
}
export async function POST(req:NextRequest) {
  try { assertUploadRuntime(); if(!authorized(req)) throw new UploadError('unauthorized','Cleanup authorization is required.',401); return NextResponse.json({cleanup:await cleanupExpiredUploads()},{headers:{'Cache-Control':'no-store'}}); }
  catch(error) { return uploadErrorResponse(error); }
}
