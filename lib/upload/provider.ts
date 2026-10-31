import { UploadError, UPLOAD_LIMITS } from './contracts';

export type ImageProviderInput = { prompt: string; referencePng: Buffer };
export type ImageProviderOutput = { png: Buffer; model: string };
const MAX_RESPONSE_BYTES=32*1024*1024;

async function readBoundedBody(response:Response):Promise<Buffer>{
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>MAX_RESPONSE_BYTES)throw new UploadError('provider_response_too_large','Image creation returned an oversized response.',502);
  if(!response.body)throw new UploadError('provider_invalid_response','Image creation did not return a usable result.',502);
  const reader=response.body.getReader();const chunks:Buffer[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE_BYTES){await reader.cancel();throw new UploadError('provider_response_too_large','Image creation returned an oversized response.',502);}chunks.push(Buffer.from(value));}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks,size);
}

function apiKey(): string {
  const value = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env['gemini-api-key'];
  const key = value?.replace(/^['"]|['"]$/g, '').trim();
  if (!key || key.includes('your_gemini_api_key_here')) throw new UploadError('provider_unavailable', 'Image creation is temporarily unavailable.', 503);
  return key;
}

/** Single image-capable Gemini call. There is deliberately no fallback model or text-only path. */
export async function generateReferenceImage(input: ImageProviderInput): Promise<ImageProviderOutput> {
  const model = (process.env.UPLOAD_IMAGE_MODEL || 'gemini-nano-banana-2.1').trim();
  if (!/^[A-Za-z0-9._-]{3,100}$/.test(model)) throw new UploadError('provider_config', 'Image creation is temporarily unavailable.', 503);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey() },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ contents: [{ role: 'user', parts: [
      { text: input.prompt }, { inlineData: { mimeType: 'image/png', data: input.referencePng.toString('base64') } },
      ] }], generationConfig: { responseModalities: ['TEXT','IMAGE'], imageConfig: { aspectRatio: '3:4', imageSize: '2K' } } }),
  });
  if (!response.ok) {
    if(response.status>=500)throw new UploadError('provider_outcome_unknown','Image creation may have been processed, but its result is unknown. Start another request only after resolving this attempt.',503);
    const code = response.status === 429 ? 'provider_rate_limited' : response.status === 401 || response.status === 403 ? 'provider_auth' : 'provider_failed';
    throw new UploadError(code, response.status === 429 ? 'Image creation is busy. Try again later.' : 'Image creation could not be completed. Try again later.', response.status === 429 ? 429 : 502);
  }
  const body = (await readBoundedBody(response)).toString('utf8');
  let data: any;
  try { data = JSON.parse(body); } catch { throw new UploadError('provider_invalid_response', 'Image creation did not return a usable result. Try again later.', 502); }
  const parts = data?.candidates?.flatMap((candidate: any) => candidate?.content?.parts || []) || [];
  const encoded = parts.find((part: any) => part?.inlineData?.data && /^image\/(png|jpeg|webp)$/.test(part.inlineData.mimeType || ''))?.inlineData;
  if (!encoded) throw new UploadError('provider_no_image', 'The image provider did not return artwork. Your request was not replaced with another image.', 502);
  let bytes: Buffer;
  try {
    if(typeof encoded.data!=='string'||encoded.data.length%4!==0||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded.data))throw new Error('invalid base64');
    bytes = Buffer.from(encoded.data, 'base64');
    if(bytes.toString('base64')!==encoded.data)throw new Error('non-canonical base64');
  } catch { throw new UploadError('provider_invalid_response', 'Image creation returned malformed image data.', 502); }
  if (!bytes.length || bytes.length > UPLOAD_LIMITS.bytes * 4) throw new UploadError('provider_invalid_response', 'Image creation did not return a usable result.', 502);
  return { png: bytes, model };
}
