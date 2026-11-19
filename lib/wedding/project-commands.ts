import { firestoreDb } from '../firebase-admin';
import { WEDDING_DAY, weddingApprovalFingerprint, type WeddingActor, type WeddingHousehold } from './domain';
import { assertWeddingActorInTransaction, assertWeddingMutable, weddingId, weddingProjectRef, weddingSessionRef, WeddingError } from './server';
import { matchVersion, object } from './validation';

export async function editWeddingSelection(actor:WeddingActor, input:Record<string,unknown>) {
  const undo = input.action === 'undoApproval';
  const ids = undo ? [weddingId(input.id)] : Array.isArray(input.ids) ? input.ids.map(weddingId) : [];
  if (!ids.length || ids.length > 250 || new Set(ids).size !== ids.length) throw new WeddingError('invalid_selection','Choose up to 250 different households.');
  const revisions = undo ? {[ids[0]]:input.revision} : object(input.revisions);
  await firestoreDb.runTransaction(async tx => {
    const {project} = await assertWeddingActorInTransaction(tx,actor);
    assertWeddingMutable(project);
    const templateId = undo || input.templateId === null ? null : weddingId(input.templateId);
    if (templateId && !project.templates.some(t=>t.id===templateId)) throw new WeddingError('template_missing','Choose an existing template.');
    const ref = weddingProjectRef(project.id);
    const rows = await Promise.all(ids.map(id=>tx.get(ref.collection('households').doc(id))));
    const paid = (project as typeof project & {paidHouseholds?:Record<string,string>}).paidHouseholds ?? {};
    rows.forEach((doc,i) => {
      const row = doc.data() as WeddingHousehold | undefined;
      if (!row || row.paidBatchId || paid[ids[i]]) throw new WeddingError('unavailable_household','Select an editable household.',409);
      matchVersion(row.revision,revisions[row.id]);
      const next = {...row,revision:row.revision+1};
      if (undo) next.approvedFingerprint=null;
      else {
        next.templateId=templateId;
        if (weddingApprovalFingerprint(project,row)!==weddingApprovalFingerprint(project,next)) {
          next.approvedFingerprint=null; next.contentRevision++;
        }
      }
      tx.set(doc.ref,next);
    });
    const at=Date.now();
    tx.update(ref,{revision:project.revision+1,updatedAt:at,expiresAt:at+180*WEDDING_DAY});
  });
}

export async function revokeWeddingDevice(actor:WeddingActor,input:Record<string,unknown>) {
  const sessionId=weddingId(input.sessionId);
  await firestoreDb.runTransaction(async tx => {
    const {project} = await assertWeddingActorInTransaction(tx,actor,'owner');
    const ref=weddingSessionRef(sessionId);
    const session=(await tx.get(ref)).data();
    if (!session || session.projectId!==project.id) throw new WeddingError('unknown_device','This device is unavailable.',404);
    if (sessionId===actor.sessionId) throw new WeddingError('current_device','Use another linked device to revoke this session.',409);
    tx.update(ref,{revoked:true});
  });
}
