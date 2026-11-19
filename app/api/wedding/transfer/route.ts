import { NextRequest } from 'next/server';
import { WEDDING_DEVICE_COOKIE, readWeddingBody, setWeddingCookie, weddingErrorResponse, weddingJson } from '@/lib/wedding/server';
import { transferWeddingDraft, WeddingTransferError } from '@/lib/wedding/transfer';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest) {
  let capability:{name:string;value:string}|undefined;
  const withCapability=(response:ReturnType<typeof weddingJson>)=>{if(capability)response.cookies.set(capability.name,capability.value,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/api',maxAge:30*86400});return response;};
  try {
    const result=await transferWeddingDraft(req,await readWeddingBody(req,200_000),(name,value)=>{capability={name,value};});
    const response=weddingJson(result.body);
    setWeddingCookie(response,result.sessionToken);
    setWeddingCookie(response,result.deviceToken,WEDDING_DEVICE_COOKIE);
    return withCapability(response);
  } catch(error) {
    if(error instanceof WeddingTransferError)return withCapability(weddingJson({error:error.message,code:error.code,...error.details},error.status));
    return withCapability(weddingErrorResponse(error));
  }
}
