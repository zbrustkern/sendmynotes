import { exchangeWeddingAddress, useWeddingAddressSession, WEDDING_ADDRESS_COOKIE } from '@/lib/wedding/address';
import { WeddingError, assertWeddingOrigin, assertWeddingRuntime, readWeddingBody, setWeddingCookie, weddingCookie, weddingErrorResponse, weddingJson } from '@/lib/wedding/server';
export const runtime='nodejs';
export async function GET(req:Request){try{assertWeddingRuntime(req);return weddingJson(await useWeddingAddressSession(weddingCookie(req,WEDDING_ADDRESS_COOKIE)));}catch(error){return weddingErrorResponse(error);}}
export async function POST(req:Request){try{assertWeddingRuntime(req);assertWeddingOrigin(req);const body=await readWeddingBody(req,20_000);
  if(body.action==='redeem'){const {token,expiresAt}=await exchangeWeddingAddress(body.token);const res=weddingJson({expiresAt,submitted:false});setWeddingCookie(res,token,WEDDING_ADDRESS_COOKIE);return res;}
  if(body.action==='submit')return weddingJson(await useWeddingAddressSession(weddingCookie(req,WEDDING_ADDRESS_COOKIE),{address:body.address}));
  throw new WeddingError('invalid_action','Choose redeem or submit.');
}catch(error){return weddingErrorResponse(error);}}
