import { NextRequest } from 'next/server';
import { accountError, accountJson, requireAccountActor } from '@/lib/account/http';
import { listReminderOccurrences } from '@/lib/reminders-v2/engine';
export async function GET(req:NextRequest){try{const actor=await requireAccountActor(req);return accountJson(await listReminderOccurrences(actor));}catch(e){return accountError(e);}}
