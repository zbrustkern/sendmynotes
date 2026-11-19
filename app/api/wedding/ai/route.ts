import { NextResponse } from 'next/server';
import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { requireWeddingActor, weddingCookie, WEDDING_DEVICE_COOKIE, WEDDING_PRIVATE_HEADERS, WeddingError } from '../../../../lib/wedding/server';
import { createWeddingAiService, type WeddingAiContext } from '../../../../lib/wedding/ai';
import { readWeddingAiBody } from '../../../../lib/wedding/ai-provider';
import { aiId, validateWeddingAiRequest, WeddingAiError, WEDDING_AI_LIMITS } from '../../../../lib/wedding/ai-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
function json(value: unknown,status = 200) {return NextResponse.json(value,{status,headers:WEDDING_PRIVATE_HEADERS});}
function failure(error: unknown) {
  const known=error instanceof WeddingAiError || error instanceof WeddingError;
  return json({error:known?error.message:'AI is temporarily unavailable. Your existing work is saved.',code:known?error.code:'ai_unavailable'},known?error.status:503);
}
async function context(req: Request): Promise<WeddingAiContext> {
  const actor=await requireWeddingActor(req,'edit');
  // The operator must verify the proxy chain on this deployment. An external
  // load balancer can append both client and proxy addresses. Never guess.
  const hops=Number(process.env.WEDDING_AI_TRUSTED_PROXY_HOPS||0);
  const address=Number.isInteger(hops)&&hops>=1&&hops<=5?(req.headers.get('x-forwarded-for')||'').split(',').at(-hops)?.trim()||'':'';
  const secret=process.env.WEDDING_AI_NETWORK_HASH_SECRET || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env['gemini-api-key'];
  const networkSignal=process.env.K_SERVICE && secret && isIP(address) ? createHmac('sha256',secret).update(`wedding-ai-network:${Math.floor(Date.now()/86_400_000)}:${address}`).digest('hex') : undefined;
  return {actor,deviceId:createHash('sha256').update(weddingCookie(req,WEDDING_DEVICE_COOKIE)||actor.sessionId||actor.actorId).digest('hex'),...(networkSignal?{networkSignal}:{}),signal:req.signal,reauthorize:()=>requireWeddingActor(req,'edit')};
}
export async function GET(req: Request) {
  try {
    const ctx=await context(req),params=new URL(req.url).searchParams,id=params.get('jobId');
    if([...params.keys()].some(k=>k!=='jobId'))throw new WeddingAiError('invalid_query','Choose a valid AI status request.');
    return json(await createWeddingAiService().get(ctx,id?aiId(id):undefined));
  } catch(error) {return failure(error);}
}
export async function POST(req: Request) {
  try {
    const ctx=await context(req);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')||'')) throw new WeddingAiError('json_required','Use a JSON request.',415);
    if(Number(req.headers.get('content-length'))>WEDDING_AI_LIMITS.requestBytes)throw new WeddingAiError('request_too_large','Choose a smaller AI request.',413);
    const controller=new AbortController(),cancel=()=>controller.abort();req.signal.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,10_000);let body: unknown;
    try {
      if(req.signal.aborted)controller.abort();
      const bytes=await readWeddingAiBody(req.body,WEDDING_AI_LIMITS.requestBytes,controller.signal);
      try {body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
      catch {throw new WeddingAiError('invalid_json','Check the JSON request.');}
    } finally {clearTimeout(timer);req.signal.removeEventListener('abort',cancel);}
    const request=validateWeddingAiRequest(body,req.headers.get('idempotency-key'));
    return json(await createWeddingAiService().post(ctx,request));
  } catch(error) {return failure(error);}
}
