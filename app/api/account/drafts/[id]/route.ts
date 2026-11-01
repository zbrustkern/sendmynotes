import { NextRequest } from 'next/server';
import { accountError, accountJson, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { deleteAccountDraft, getAccountDraft, updateAccountDraft } from '@/lib/account/drafts';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAccountActor(req); const { id } = await params; return accountJson(await getAccountDraft(actor, id)); }
  catch (error) { return accountError(error); }
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAccountActor(req, true); const { id } = await params; return accountJson(await updateAccountDraft(actor, id, await readAccountBody(req))); }
  catch (error) { return accountError(error); }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAccountActor(req, true); const { id } = await params; const body = await readAccountBody(req); await deleteAccountDraft(actor, id, body.expectedVersion); return accountJson({ removed: true }); }
  catch (error) { return accountError(error); }
}
