import { issueWeddingPilot, revokeWeddingPilot } from '@/lib/wedding/pilot';
import { WeddingError, assertWeddingOrigin, assertWeddingRuntime, readWeddingBody, weddingErrorResponse, weddingIdentity, weddingJson } from '@/lib/wedding/server';
export const runtime='nodejs';
/** Operator invokes with a freshly verified Firebase bearer; no public pilot password exists. */
export async function POST(req:Request){try{assertWeddingRuntime(req);assertWeddingOrigin(req);const identity=(await weddingIdentity(req,true))!,body=await readWeddingBody(req,4000);if(body.action==='issue')return weddingJson(await issueWeddingPilot(identity,body.projectId),201);if(body.action==='revoke'){await revokeWeddingPilot(identity,body.inviteId);return weddingJson({revoked:true});}throw new WeddingError('invalid_action','Choose issue or revoke.');}catch(error){return weddingErrorResponse(error);}}
