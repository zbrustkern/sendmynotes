import {ARTWORK_LIMITS, WeddingArtworkError, artworkId} from './artwork-policy';
import {composeWeddingArtwork, intakeWeddingArtwork, readWeddingArtwork, WeddingArtworkSelection} from './artwork';
import {adoptWeddingStudioArtwork} from './artwork-studio';
import type {NextRequest} from 'next/server';
import {isSameOrigin} from '../upload/http';
import {enforceWeddingNetworkRateLimit} from './rate-limit';

type Actor={projectId:string;actorId:string;pilot:boolean;verified:boolean};
type Authorize=(req:Request,scope?:'edit')=>Promise<Actor>;
const headers={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie, Authorization, Origin','X-Content-Type-Options':'nosniff'};
export function weddingArtworkErrorResponse(error:unknown):Response {
  const e=error as {status?:number;code?:string;message?:string};
  const safe=error instanceof Error&&['WeddingArtworkError','WeddingError','UploadError'].includes(error.name)&&typeof e.status==='number'&&e.status>=400&&e.status<=599;
  return Response.json({error:safe?e.message:'Artwork is temporarily unavailable. Retry shortly.',code:safe?e.code:'artwork_unavailable'},{status:safe?e.status:503,headers});
}
/** Count bytes as the stream arrives; Content-Length is only an early rejection.
 * Cancellation releases the reader on abort, oversize, timeout and parser failure. */
export async function readArtworkRequest(req:Request,maxBytes:number,deadlineMs:number=ARTWORK_LIMITS.receiveMs):Promise<Buffer> {
  const declared=req.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes))throw new WeddingArtworkError('file_too_large','Image request is too large.',413);
  if(!req.body)throw new WeddingArtworkError('invalid_file','Choose an image file.');
  const reader=req.body.getReader();let size=0, timer:ReturnType<typeof setTimeout>|undefined;
  const chunks:Buffer[]=[];
  let rejectStop:(error:Error)=>void=()=>{};
  const stopped=new Promise<never>((_,reject)=>{rejectStop=reject;});
  const stop=(error:Error)=>{rejectStop(error);void reader.cancel().catch(()=>{});};
  const abort=()=>stop(new WeddingArtworkError('cancelled','The upload was cancelled.',499));
  req.signal.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>stop(new WeddingArtworkError('upload_timeout','Upload took too long. Retry with a smaller image.',408)),deadlineMs);
  try {
    if(req.signal.aborted)abort();
    while(true){const part=await Promise.race([reader.read(),stopped]);if(part.done)break;
      size+=part.value.byteLength;
      if(size>maxBytes){void reader.cancel().catch(()=>{});throw new WeddingArtworkError('file_too_large','Image must be 15 MB or smaller.',413);}
      chunks.push(Buffer.from(part.value));
    }
    if(req.signal.aborted)throw new WeddingArtworkError('cancelled','The upload was cancelled.',499);
    return Buffer.concat(chunks,size);
  } finally {clearTimeout(timer);req.signal.removeEventListener('abort',abort);reader.releaseLock();}
}
/** Exactly one file part. This avoids an unbounded formData parser and prevents
 * duplicate file fields, nested multipart, arbitrary fields and header bombs. */
export function parseArtworkMultipart(bytes:Buffer,contentType:string):{bytes:Buffer;mime:string} {
  const match=/^multipart\/form-data;\s*boundary=(?:"([A-Za-z0-9'()+_,.\/:=? -]{1,70})"|([A-Za-z0-9'()+_,.\/:=?-]{1,70}))\s*$/i.exec(contentType);
  if(!match)throw new WeddingArtworkError('invalid_multipart','Choose one JPEG, PNG or WebP file.');
  const boundary=match[1]||match[2],prefix=Buffer.from(`--${boundary}\r\n`),delimiter=Buffer.from(`\r\n--${boundary}`);
  if(!bytes.subarray(0,prefix.length).equals(prefix))throw new WeddingArtworkError('invalid_multipart','The image upload is incomplete. Retry.');
  const headerEnd=bytes.indexOf('\r\n\r\n',prefix.length);
  if(headerEnd<0||headerEnd-prefix.length>8192)throw new WeddingArtworkError('invalid_multipart','The image upload headers are invalid.');
  const lines=bytes.toString('utf8',prefix.length,headerEnd).split('\r\n');
  const fields=new Map<string,string>();
  for(const line of lines){const part=/^([A-Za-z-]+):\s*([^\r\n]*)$/.exec(line);if(!part||fields.has(part[1].toLowerCase()))throw new WeddingArtworkError('invalid_multipart','The image upload headers are invalid.');fields.set(part[1].toLowerCase(),part[2]);}
  if([...fields.keys()].some(k=>!['content-disposition','content-type'].includes(k)))throw new WeddingArtworkError('invalid_multipart','The image upload headers are invalid.');
  const disposition=/^form-data;\s*name="file";\s*filename="([^"\r\n]*)"$/i.exec(fields.get('content-disposition')||'');
  if(!disposition||!disposition[1]||disposition[1].length>255||/[\\/\u0000-\u001f\u007f]/.test(disposition[1]))throw new WeddingArtworkError('invalid_file','Choose one image using the file field.');
  const start=headerEnd+4,end=bytes.indexOf(delimiter,start);
  if(end<0)throw new WeddingArtworkError('invalid_multipart','The image upload is incomplete. Retry.');
  const tail=bytes.subarray(end+delimiter.length).toString('ascii');
  if(tail!=='--\r\n'&&tail!=='--')throw new WeddingArtworkError('invalid_multipart','Choose exactly one image file.');
  const file=bytes.subarray(start,end),mime=(fields.get('content-type')||'').toLowerCase();
  if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new WeddingArtworkError('unsupported_type','Choose a still JPEG, PNG or WebP image.',415);
  if(file.length===0||file.length>ARTWORK_LIMITS.inputBytes)throw new WeddingArtworkError('file_too_large','Image must be 15 MB or smaller.',413);
  return {bytes:file,mime};
}
export function createWeddingArtworkHandlers(authorize:Authorize, api={intake:intakeWeddingArtwork,compose:composeWeddingArtwork,read:readWeddingArtwork,adopt:adoptWeddingStudioArtwork}) {
  return {
    async POST(req:Request) {
      try {
        if(!isSameOrigin(req as NextRequest))throw new WeddingArtworkError('origin_forbidden','Request origin is not allowed.',403);
        await enforceWeddingNetworkRateLimit(req,'artwork');
        const requirePilot=process.env.WEDDING_REQUIRE_PILOT==='true';
        const actor=await authorize(req,'edit');
        if(requirePilot&&!actor.pilot)throw new WeddingArtworkError('pilot_required','A current wedding pilot invitation is needed to upload or edit photos.',403);
        const ctx={signal:req.signal,authorize:async()=>{const current=await authorize(req,'edit');if(current.projectId!==actor.projectId||current.actorId!==actor.actorId||(requirePilot&&!current.pilot))throw new WeddingArtworkError(requirePilot?'pilot_required':'access_revoked','Your photo access changed. Reopen the project.',403);}};
        const type=req.headers.get('content-type')||'';
        let result:WeddingArtworkSelection;
        if(type.toLowerCase().startsWith('multipart/form-data')) {
          // The service reserves project and deployment concurrency before receiving bytes.
          result=await api.intake(actor.projectId,async()=>parseArtworkMultipart(await readArtworkRequest(req,ARTWORK_LIMITS.requestBytes),type),{},ctx);
        } else if(/^application\/json(?:;|$)/i.test(type)) {
          let body:Record<string,unknown>;
          try {body=JSON.parse((await readArtworkRequest(req,8192)).toString('utf8'));}catch(error){if(error instanceof WeddingArtworkError)throw error;throw new WeddingArtworkError('invalid_json','The artwork request is invalid.');}
          if(!body||typeof body!=='object'||Array.isArray(body))throw new WeddingArtworkError('invalid_request','The artwork request is invalid.');
          if(body.action==='compose'){artworkId(body.assetId);result=await api.compose(actor.projectId,body.assetId,body,ctx);}
          else if(body.action==='adoptStudio'){if(!actor.verified)throw new WeddingArtworkError('sign_in_required','Sign in with your verified account to use Studio artwork.',401);artworkId(body.designId);result=await api.adopt(req,actor.projectId,body.designId,ctx);}
          else throw new WeddingArtworkError('invalid_action','Choose upload, crop or an accepted Studio front.');
        } else throw new WeddingArtworkError('unsupported_type','Send an image file or crop settings.',415);
        await ctx.authorize();
        return Response.json(result,{status:201,headers});
      } catch(error) {return weddingArtworkErrorResponse(error);}
    },
    async GET(req:Request) {
      try {
        const actor=await authorize(req),id=new URL(req.url).searchParams.get('id');artworkId(id);
        const bytes=await api.read(actor.projectId,id);
        const current=await authorize(req);
        if(current.projectId!==actor.projectId||current.actorId!==actor.actorId)throw new WeddingArtworkError('not_found','Card front not found.',404);
        return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Type':'image/png','Content-Length':String(bytes.length),'Content-Disposition':'inline; filename="card-front.png"','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; sandbox"}});
      } catch(error) {return weddingArtworkErrorResponse(error);}
    },
  };
}
