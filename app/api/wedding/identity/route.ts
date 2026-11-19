import { claimWeddingMembership, listWeddingAccountProjects, resumeWeddingAccount } from '@/lib/wedding/project';
import { assertWeddingOrigin, assertWeddingRuntime, publicWeddingActor, readWeddingBody, requireWeddingActor, setWeddingCookie, weddingErrorResponse, weddingIdentity, weddingJson } from '@/lib/wedding/server';
export const runtime='nodejs';
export async function GET(req:Request){try{assertWeddingRuntime();if(new URL(req.url).searchParams.has('projects'))return weddingJson(await listWeddingAccountProjects((await weddingIdentity(req,true))!));return weddingJson({actor:publicWeddingActor(await requireWeddingActor(req))});}catch(error){return weddingErrorResponse(error);}}
export async function POST(req:Request){try{assertWeddingRuntime();assertWeddingOrigin(req);const identity=(await weddingIdentity(req,true))!;
  const body=req.body?await readWeddingBody(req,4000):{};
  if(body.action==='resume'){const result=await resumeWeddingAccount(identity,body),response=weddingJson({projectId:result.projectId,actorId:result.actorId,resumed:true});setWeddingCookie(response,result.token);return response;}
  const actor=await requireWeddingActor(req);await claimWeddingMembership(actor,identity);return weddingJson({actor:publicWeddingActor(await requireWeddingActor(req))});
}catch(error){return weddingErrorResponse(error);}}
