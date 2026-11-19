import { NextResponse } from 'next/server';
import { WEDDING_DEVICE_COOKIE, WEDDING_PRIVATE_HEADERS, assertWeddingOrigin, assertWeddingRuntime, newWeddingSecret, readWeddingBody, requireWeddingActor, setWeddingCookie, weddingCookie, weddingErrorResponse, weddingIdentity, weddingJson, WeddingError } from '@/lib/wedding/server';
import { acceptWeddingAddress, approveWeddingHouseholds, changeWeddingGrant, claimWeddingMembership, createWeddingProject, exportWeddingTracker, extendWeddingProject, importWeddingHouseholds, inviteWeddingMember, redeemWeddingInvite, revokeWeddingInvite, revokeWeddingSession, saveWeddingHousehold, saveWeddingProject, weddingState } from '@/lib/wedding/project';
import { issueWeddingPilot } from '@/lib/wedding/pilot';
import {editWeddingSelection} from '@/lib/wedding/project-commands';
export const runtime='nodejs';
function csvResponse(csv:string){return new NextResponse(csv,{headers:{...WEDDING_PRIVATE_HEADERS,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="thank-you-tracker.csv"'}});}
function withSession(req:Request,token:string){const headers=new Headers(req.headers);headers.set('cookie',`smn_wedding_session=${token}`);return new Request(req.url,{headers,method:'GET'});}
export async function GET(req:Request) {
  try{const url=new URL(req.url),actor=await requireWeddingActor(req,url.searchParams.has('export')?'export':'edit');
    if(url.searchParams.has('export'))return csvResponse(await exportWeddingTracker(actor,url.searchParams.get('includeGift')==='1'));
    const limit=url.searchParams.get('limit');if(limit&&!/^\d{1,3}$/.test(limit))throw new WeddingError('invalid_page','Choose a page size between 1 and 100.');
    return weddingJson(await weddingState(actor,{cursor:url.searchParams.get('cursor')||undefined,limit:limit?Number(limit):undefined}));
  }catch(error){return weddingErrorResponse(error);}
}
export async function POST(req:Request) {
  try {
    assertWeddingRuntime();assertWeddingOrigin(req);const body=await readWeddingBody(req);let extra:Record<string,unknown>={};
    if(body.action==='create'){
      // Retrying the initial request with its cookie resumes the existing project.
      if(weddingCookie(req)&&body.new!==true){try{return weddingJson(await weddingState(await requireWeddingActor(req)));}catch(error){if(!(error instanceof WeddingError)||!['unauthorized','session_expired','not_found'].includes(error.code))throw error;}}
      const device=weddingCookie(req,WEDDING_DEVICE_COOKIE)||newWeddingSecret().token;
      const created=await createWeddingProject(device,body.sample===true),actor=await requireWeddingActor(withSession(req,created.token));
      const response=weddingJson(await weddingState(actor),201);setWeddingCookie(response,created.token);setWeddingCookie(response,device,WEDDING_DEVICE_COOKIE);return response;
    }
    if(body.action==='redeem'){
      let current;try{current=await requireWeddingActor(req);}catch(error){if(!(error instanceof WeddingError)||error.status!==401)throw error;}
      const redeemed=await redeemWeddingInvite(body.token,current),actor=await requireWeddingActor(redeemed.token?withSession(req,redeemed.token):req),response=weddingJson(await weddingState(actor));if(redeemed.token)setWeddingCookie(response,redeemed.token);return response;
    }
    const actor=await requireWeddingActor(req,body.action==='export'?'export':'edit');
    switch(body.action){
      case 'saveProject':extra=await saveWeddingProject(actor,body);break;
      case 'previewProject':return weddingJson(await saveWeddingProject(actor,body,true));
      case 'saveHousehold':extra=await saveWeddingHousehold(actor,body);break;
      case 'importHouseholds':extra=await importWeddingHouseholds(actor,body);break;
      case 'assignTemplate':case 'undoApproval':await editWeddingSelection(actor,body);break;
      case 'approve':extra=await approveWeddingHouseholds(actor,body);break;
      case 'invite':
        if(body.kind==='pilot'){if(actor.role!=='owner')throw new WeddingError('owner_required','Only the owner can invite a pilot tester.',403);extra=await issueWeddingPilot((await weddingIdentity(req,true))!,actor.projectId);}
        else extra=await inviteWeddingMember(actor,body);break;
      case 'revokeInvite':await revokeWeddingInvite(actor,body.inviteId);break;
      case 'revokeSession':{const revoked=await revokeWeddingSession(actor,body.sessionId);if(revoked.revokedCurrent){const response=weddingJson(revoked);response.cookies.set('smn_wedding_session','',{path:'/',maxAge:0});return response;}break;}
      case 'grant':await changeWeddingGrant(actor,body);break;
      case 'revoke':await changeWeddingGrant(actor,body,true);break;
      case 'claim':await claimWeddingMembership(actor,(await weddingIdentity(req,true))!);break;
      case 'extend':await extendWeddingProject(actor);break;
      case 'acceptAddress':await acceptWeddingAddress(actor,body);break;
      case 'export':return csvResponse(await exportWeddingTracker(actor,body.includeGift===true));
      default:throw new WeddingError('invalid_action','Choose a supported project action.');
    }
    return weddingJson({...await weddingState(await requireWeddingActor(req)),...extra});
  }catch(error){return weddingErrorResponse(error);}
}
