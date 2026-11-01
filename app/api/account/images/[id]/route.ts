import { NextRequest } from 'next/server';
import { accountError, accountJson, readAccountBody, requireAccountActor } from '@/lib/account/http';
import { deleteAccountImage, getAccountImage, renameAccountImage } from '@/lib/account/images';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAccountActor(req); const { id } = await params; const { image } = await getAccountImage(actor, id); return accountJson(image); }
  catch (error) { return accountError(error); }
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAccountActor(req, true); const { id } = await params; const body = await readAccountBody(req); return accountJson(await renameAccountImage(actor, id, body.title, body.expectedVersion)); }
  catch (error) { return accountError(error); }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAccountActor(req, true); const { id } = await params; const body = await readAccountBody(req); await deleteAccountImage(actor, id, body.expectedVersion); return accountJson({ removed: true }); }
  catch (error) { return accountError(error); }
}
