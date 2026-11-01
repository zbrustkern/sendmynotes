import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { accountCollection, accountScope, AccountError, accountError, accountJson, readAccountBody, requireAccountActor } from '@/lib/account/http';

type RequestRow = { id: string; kind: 'export'|'deletion'; status: 'received'|'manual_review'; createdAt: number; updatedAt: number; ownerUid: string; ownerScope: string };
function project(row: RequestRow) { return { id: row.id, kind: row.kind, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt }; }

export async function GET(req: NextRequest) {
  try {
    const actor = await requireAccountActor(req);
    const result = await accountCollection('privacy_requests').where('ownerScope','==',accountScope(actor.uid)).orderBy('createdAt','desc').limit(50).get();
    const data = result.docs.map(doc => doc.data() as RequestRow).filter(row => row.ownerScope === accountScope(actor.uid)).map(project);
    return accountJson(data);
  } catch (error) { return accountError(error); }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAccountActor(req, true);
    const body = await readAccountBody(req);
    if (body.kind !== 'export' && body.kind !== 'deletion') throw new AccountError('invalid', 'Choose a data export or account deletion request.');
    if (body.kind === 'deletion' && body.confirm !== true) throw new AccountError('confirmation_required', 'Confirm that you want to request account deletion.');
    const now = Date.now();
    const id = randomUUID();
    const row: RequestRow = { id, kind: body.kind, status: 'manual_review', createdAt: now, updatedAt: now, ownerUid: actor.uid, ownerScope: accountScope(actor.uid) };
    // The document path is server-derived and uses a cryptographically random
    // UUID; clients cannot choose or overwrite a request identifier.
    await accountCollection('privacy_requests').doc(`${accountScope(actor.uid)}_${id}`).set(row);
    return accountJson(project(row), 201);
  } catch (error) { return accountError(error); }
}
