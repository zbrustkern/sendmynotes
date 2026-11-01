import { NextRequest } from 'next/server';
import { accountError, accountJson, requireAccountActor } from '@/lib/account/http';
import { getAccountImage } from '@/lib/account/images';
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const actor = await requireAccountActor(req); const { id } = await params; const { row, image } = await getAccountImage(actor, id); return accountJson({ image, ...(image.selection ? { selection: image.selection } : {}), masterSha256: row.masterSha256 }); }
  catch (error) { return accountError(error); }
}
