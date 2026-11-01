import { NextRequest } from 'next/server';
import { accountError, accountJson, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { getAccountPreferences, saveAccountPreferences } from '@/lib/account/preferences';

export async function GET(req: NextRequest) {
  try { const actor = await requireAccountActor(req); return accountJson(await getAccountPreferences(actor)); }
  catch (error) { return accountError(error); }
}

export async function PATCH(req: NextRequest) {
  try { const actor = await requireAccountActor(req, true); const body = await readAccountBody(req); return accountJson(await saveAccountPreferences(actor, body)); }
  catch (error) { return accountError(error); }
}
