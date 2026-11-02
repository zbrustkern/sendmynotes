import { NextRequest } from 'next/server';
import { accountError, accountJson, requireAccountActor, validAccountId } from '@/lib/account/http';
import { previewPrivacyRequest } from '@/lib/account/privacy-requests';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAccountActor(req);
    const { id: rawId } = await context.params;
    return accountJson(await previewPrivacyRequest(actor, validAccountId(rawId)));
  } catch (error) { return accountError(error); }
}
