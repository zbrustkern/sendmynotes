import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { dispatchDueReminders } from '@/lib/reminders-v2/engine';
export const runtime='nodejs'; export const dynamic='force-dynamic';
function authorized(req:NextRequest){const secret=process.env.REMINDER_WORKER_SECRET?.trim();if(!secret||process.env.ACCOUNT_REMINDER_DELIVERY_ACTIVE!=='true')return false;const provided=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');const a=Buffer.from(provided),b=Buffer.from(secret);return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);}
export async function POST(req:NextRequest){if(!authorized(req))return NextResponse.json({error:'Reminder dispatch is not active.',code:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});try{return NextResponse.json({data:await dispatchDueReminders()},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Reminder dispatch needs attention.',code:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}}
