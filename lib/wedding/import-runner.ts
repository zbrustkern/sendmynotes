import { Worker } from "node:worker_threads";
import path from "node:path";
import { type ImportFormat, type ParsedWeddingSource, maxWeddingFileBytes } from "./import-contract";

export class ImportCheckError extends Error {
  constructor(message: string, public status = 422, public code = "invalid_list") { super(message); }
}
export async function readBoundedImport(request: Request, max = maxWeddingFileBytes): Promise<Buffer> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max)) throw new ImportCheckError("Choose a smaller list or split the file.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ImportCheckError("Choose a file or paste a list.");
  const parts: Uint8Array[] = [];
  let bytes = 0, expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 15000);
  try {
    while (true) {
      const part = await reader.read();
      if (expired) throw new ImportCheckError("Receiving the file timed out. Try a smaller list.", 408, "retryable");
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > max) {
        await reader.cancel().catch(() => {}); throw new ImportCheckError("Choose a smaller list or split the file.", 413);
      }
      parts.push(part.value);
    }
    if (!bytes) throw new ImportCheckError("Choose a file or paste a list.");
    return Buffer.concat(parts, bytes);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
let active = 0;
export async function parseWeddingFile(bytes: Buffer, format: ImportFormat, deadline = 15000): Promise<ParsedWeddingSource> {
  if (!bytes.length || bytes.length > maxWeddingFileBytes) throw new ImportCheckError("Choose a list of up to 5 MiB.",413);
  if (active >= 2) throw new ImportCheckError("Two lists are being checked. Try again shortly.",429,"retryable");
  active++;
  let worker: Worker | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    worker = new Worker(path.join(process.cwd(),"lib/wedding/import-worker.cjs"), {
      workerData:{ bytes, format }, env: {}, execArgv: [],
      resourceLimits:{maxOldGenerationSizeMb:80,maxYoungGenerationSizeMb:12,stackSizeMb:3},
    });
    const liveWorker = worker;
    return await new Promise<ParsedWeddingSource>((resolve,reject) => {
      timer = setTimeout(() => reject(new ImportCheckError("Reading this list timed out. Export a smaller CSV and try again.",408,"retryable")),deadline);
      liveWorker.once("message",res => {
        if (res.error) reject(new ImportCheckError(res.error));
        else if (res.data?.tables && res.data?.excerpts) resolve(res.data);
        else reject(new ImportCheckError("Reading this list stopped. Please try another file.",503,"retryable"));
      });
      liveWorker.once("error",()=>reject(new ImportCheckError("This list exceeded the processing limits. Split the file and retry.",422)));
      liveWorker.once("exit",()=>reject(new ImportCheckError("Reading this list stopped. Please try again.",503,"retryable")));
    });
  } finally {
    clearTimeout(timer); try { await worker?.terminate(); } finally { active--; }
  }
}
