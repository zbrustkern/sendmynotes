import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ARTWORK_LIMITS, ArtworkComposition, WeddingArtworkError} from './artwork-policy';

let activeWorkers = 0;
async function residentBytes(pid: number): Promise<number> {
  const status = await readFile(`/proc/${pid}/status`, 'utf8');
  const rss=Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024;
  if(!rss)throw new Error('Memory sample unavailable');
  return rss;
}
export type ProcessedArtwork = {source: Buffer; master: Buffer; width: number; height: number; sourceWidth: number; sourceHeight: number; warning?: string};
/** The process is killed and reaped before returning on timeout, abort, or memory
 * pressure. Sharp's native allocations are bounded by pixel limits, one decode,
 * disabled cache and an RSS watchdog; V8 has a separate heap ceiling. */
export async function processWeddingArtwork(bytes: Buffer, mime: string, composition: ArtworkComposition, options: {signal?: AbortSignal; deadlineMs?: number; memoryBytes?: number; workerPath?: string; normalized?: boolean} = {}): Promise<ProcessedArtwork> {
  if (bytes.length === 0 || bytes.length > ARTWORK_LIMITS.inputBytes) throw new WeddingArtworkError('file_too_large','Image must be 15 MB or smaller.',413);
  if (options.signal?.aborted) throw new WeddingArtworkError('cancelled','Image processing was cancelled.',499);
  if (activeWorkers >= 1) throw new WeddingArtworkError('processing_busy','Another image is being checked. Retry shortly.',429);
  activeWorkers++;
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(),'wedding-art-'));
    const input=join(dir,'input'), source=join(dir,'source.png'), output=join(dir,'master.png');
    await writeFile(input,bytes,{mode:0o600});
    const result = await new Promise<Record<string, unknown>>((resolve,reject) => {
      const child=spawn(process.execPath,['--max-old-space-size=96','--max-semi-space-size=4',options.workerPath || join(process.cwd(),'lib/wedding/artwork-worker.cjs')],{
        cwd:process.cwd(), env:{NODE_ENV:'production',LANG:'C.UTF-8',VIPS_CONCURRENCY:'1',MALLOC_ARENA_MAX:'2',UV_THREADPOOL_SIZE:'1'}, stdio:['pipe','pipe','ignore','ipc'],
      });
      let reply='', failure: Error | undefined, checking=false, missedSamples=0;
      const stop=(error: Error)=>{ failure ||= error; child.kill('SIGKILL'); };
      const abort=()=>stop(new WeddingArtworkError('cancelled','Image processing was cancelled.',499));
      const timer=setTimeout(()=>stop(new WeddingArtworkError('processing_timeout','Image processing took too long. Retry or choose a smaller image.',503)),options.deadlineMs ?? ARTWORK_LIMITS.processMs);
      const memoryLimit=options.memoryBytes ?? ARTWORK_LIMITS.workerMemoryBytes;
      child.on('message',message=>{const rss=(message as {rss?:unknown})?.rss;if(typeof rss==='number'&&rss>memoryLimit)stop(new WeddingArtworkError('processing_memory','Image needs too much memory. Choose a smaller image.',413));});
      const memory=setInterval(async()=>{
        if (process.platform!=='linux'||!child.pid || checking || failure) return;
        checking=true;
        try { const rss=await residentBytes(child.pid);missedSamples=0;if (rss > memoryLimit) stop(new WeddingArtworkError('processing_memory','Image needs too much memory. Choose a smaller image.',413)); }
        catch { if(++missedSamples>=3)stop(new WeddingArtworkError('processing_memory_unavailable','The image memory guard is unavailable. Retry later.',503)); }
        finally { checking=false; }
      },50);
      const cleanup=()=>{ clearTimeout(timer);clearInterval(memory);options.signal?.removeEventListener('abort',abort); };
      options.signal?.addEventListener('abort',abort,{once:true});
      if (options.signal?.aborted) abort();
      child.stdout!.on('data',chunk=>{reply+=String(chunk);if(reply.length>8192)stop(new WeddingArtworkError('processing_failed','Image processing failed. Retry.',503));});
      child.stdin!.on('error',()=>{});
      child.on('error',()=>{failure ||= new WeddingArtworkError('processing_unavailable','Image processing is unavailable. Retry shortly.',503);});
      child.on('close',code=>{
        cleanup();
        if (failure) return reject(failure);
        try {
          const data=JSON.parse(reply);
          if (data.error) return reject(new WeddingArtworkError(data.code,data.error,data.status));
          if (code!==0 || data.width!==ARTWORK_LIMITS.width || data.height!==ARTWORK_LIMITS.height) throw new Error();
          resolve(data);
        } catch { reject(new WeddingArtworkError('processing_failed','Image processing failed. Retry or replace the file.',503)); }
      });
      child.stdin!.end(JSON.stringify({input,source,output,mime,composition,normalized:options.normalized===true}));
    });
    for (const path of [source,output]) if ((await stat(path)).size > ARTWORK_LIMITS.outputBytes) throw new WeddingArtworkError('output_too_large','Choose a smaller image.',413);
    return {source:await readFile(source),master:await readFile(output),width:Number(result.width),height:Number(result.height),sourceWidth:Number(result.sourceWidth),sourceHeight:Number(result.sourceHeight),...(typeof result.warning==='string'?{warning:result.warning}:{})};
  } finally { try {if(dir)await rm(dir,{recursive:true,force:true});} finally {activeWorkers--;} }
}
