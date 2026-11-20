import {createHash, randomInt, randomUUID} from "node:crypto";
import {tmpdir} from "node:os";
import path from "node:path";
import {readFile,writeFile,mkdir,unlink} from "node:fs/promises";
import * as admin from "firebase-admin";
import {firestoreDb,isFirestoreMock} from "../firebase-admin";
import {ImportCheckError,parseWeddingFile} from "./import-runner";
import type {ImportFormat,ParsedWeddingSource} from "./import-contract";

const version = "wedding-list-v1";
const day = 86400000;
const sha = (value: Buffer|string) => createHash("sha256").update(value).digest("hex");
const records = () => firestoreDb.collection("weddingImportSources");
const srcRef = (projectId:string,id:string) => records().doc(sha(projectId + "/" + id));
type Stored = {projectId:string; importId:string; normalizedKey:string; expiresAt:number; ready:boolean; sourceDigest:string};
const local = () => isFirestoreMock && (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development");
const localFile = (key:string) => path.join(process.env.SMN_TEST_DATA_DIR || tmpdir(), "smn-wedding-import", sha(key));
function assertPrivateKey(key:string) {
  if (!/^wedding-intake\/(?:pending|checked)\/[a-f0-9-]{20,70}$/.test(key)) throw new Error("Invalid wedding object reference.");
}
async function bucket() {
  if (isFirestoreMock || !process.env.UPLOAD_PRIVATE_BUCKET || !admin.apps.length) throw new ImportCheckError("Private upload storage is unavailable. Paste or enter the rows manually.",503,"retryable");
  const b = admin.storage().bucket(process.env.UPLOAD_PRIVATE_BUCKET);
  const [meta] = await b.getMetadata();
  if (meta.iamConfiguration?.uniformBucketLevelAccess?.enabled !== true || meta.iamConfiguration?.publicAccessPrevention !== "enforced") {
    throw new ImportCheckError("The private upload area is unavailable. Try again later.",503,"retryable");
  }
  return b;
}
async function saveObject(key:string,bytes:Buffer) {
  assertPrivateKey(key);
  if (local()) { const file = localFile(key); await mkdir(path.dirname(file),{recursive:true}); await writeFile(file,bytes,{mode:0o600}); return; }
  try {
    await (await bucket()).file(key).save(bytes,{resumable:false,public:false,validation:"crc32c",preconditionOpts:{ifGenerationMatch:0},
      metadata:{contentType:"application/octet-stream",cacheControl:"private, no-store",metadata:{purpose:"wedding-import"}}});
  } catch (err) { if ((err as {code?:number}).code !== 412) throw err; }
}
async function readObject(key:string) {
  assertPrivateKey(key);
  if (local()) return readFile(localFile(key));
  return (await (await bucket()).file(key).download())[0];
}
async function eraseObject(key:string) {
  assertPrivateKey(key);
  if (local()) { await unlink(localFile(key)).catch(e=>{if(e.code!=="ENOENT")throw e;}); return; }
  await (await bucket()).file(key).delete({ignoreNotFound:true});
}
const IMPORT_GLOBAL_SHARDS = 8;
export async function claimImportAttempt(projectId:string, shardIndex?: number) {
  const now=Date.now(), ref=firestoreDb.collection("weddingImportQuotas").doc(sha(projectId));
  const shard=shardIndex===undefined?randomInt(IMPORT_GLOBAL_SHARDS):((shardIndex%IMPORT_GLOBAL_SHARDS)+IMPORT_GLOBAL_SHARDS)%IMPORT_GLOBAL_SHARDS;
  const globalRef=firestoreDb.collection("weddingImportQuotas").doc(`site_${shard}`);
  const lease=randomUUID();
  const live=(bag:unknown):Record<string,number> => Object.fromEntries(
    Object.entries(bag || {}).filter(([,v])=>typeof v==="number" && v>now)
  ) as Record<string,number>;
  await firestoreDb.runTransaction(async tx=>{
    const [projectSnap,siteSnap]=await Promise.all([tx.get(ref),tx.get(globalRef)]);
    const data=projectSnap.data() || {};
    const events=(Array.isArray(data.events)?data.events:[]).filter((v:unknown)=>typeof v==="number" && v>now-day);
    const leases=live(data.leases), all=live(siteSnap.data()?.leases);
    if (events.length>=32 || Object.keys(leases).length>=2) throw new ImportCheckError("This project has reached its import allowance. Try again later or enter a household manually.",429,"rate_limited");
    if (Object.keys(all).length>=6) throw new ImportCheckError("Several lists are being checked. Try again shortly.",429,"retryable");
    leases[lease]=all[lease]=now+90000;
    tx.set(ref,{events:[...events,now],leases});tx.set(globalRef,{leases:all});
  });
  return async () => firestoreDb.runTransaction(async tx=>{
    const [projectSnap,siteSnap]=await Promise.all([tx.get(ref),tx.get(globalRef)]);
    for(const [snap,target] of [[projectSnap,ref],[siteSnap,globalRef]] as const) {
      const data=snap.data(); if (!data) continue;
      const leases={...data.leases}; delete leases[lease]; tx.update(target,{leases});
    }
  });
}
export async function restoreImport(projectId:string,id:string):Promise<ParsedWeddingSource> {
  if (!/^[a-f\d]{64}$/.test(id)) throw new ImportCheckError("This import could not be found.",404);
  const item=(await srcRef(projectId,id).get()).data() as Stored|undefined;
  if (!item?.ready || item.projectId!==projectId || item.importId!==id || item.expiresAt<=Date.now()) throw new ImportCheckError("This preview has expired. Choose the file again.",404);
  return JSON.parse((await readObject(item.normalizedKey)).toString("utf8"));
}
export async function checkAndStageImport(projectId:string,format:ImportFormat,bytes:Buffer) {
  const digest=sha(bytes), id=sha([version,projectId,format,digest].join("/")), ref=srcRef(projectId,id);
  const prev=(await ref.get()).data() as Stored|undefined;
  if (prev?.ready && prev.expiresAt>Date.now()) return {id, parsed:await restoreImport(projectId,id)};
  const pending=firestoreDb.collection("weddingPendingImports").doc(randomUUID());
  const pendingKey="wedding-intake/pending/"+pending.id;
  const expiresAt=Date.now()+7*day;
  // Pin both object names before writes so a terminated request can be collected.
  await pending.set({key:pendingKey,expiresAt});
  try {
    await saveObject(pendingKey,bytes);
    const parsed=await parseWeddingFile(bytes,format);
    const normalized=Buffer.from(JSON.stringify(parsed));
    if (normalized.length>5*1024**2) throw new ImportCheckError("The extracted list is too large. Export one sheet at a time.",413);
    const normalizedKey=await firestoreDb.runTransaction(async tx=>{
      const existing=(await tx.get(ref)).data();
      if (existing && existing.expiresAt>Date.now()) return String(existing.normalizedKey);
      if (existing?.normalizedKey) {
        tx.set(firestoreDb.collection("weddingPendingImports").doc(randomUUID()),{key:existing.normalizedKey,expiresAt:Date.now()});
      }
      const key="wedding-intake/checked/"+randomUUID();
      tx.set(ref,{projectId,importId:id,normalizedKey:key,sourceDigest:digest,version,format,expiresAt,ready:false});
      return key;
    });
    await saveObject(normalizedKey,normalized);
    await ref.update({ready:true});
    return {id,parsed};
  } finally {
    // If removal fails the durable pending pin stays available to scheduled cleanup.
    try { await eraseObject(pendingKey); await pending.delete(); } catch { /* cleanup retries */ }
  }
}
export async function cleanExpiredWeddingImports(now=Date.now(),limit=30) {
  let removed=0;
  for (const [collection,field] of [["weddingPendingImports","key"],["weddingImportSources","normalizedKey"]]) {
    const expired=await firestoreDb.collection(collection).where("expiresAt","<=",now).limit(limit).get();
    for(const doc of expired.docs) {
      const key=doc.data()[field];
      if (typeof key!=="string") continue;
      // A new upload of an expired digest has a new immutable object key.
      await eraseObject(key);
      await firestoreDb.runTransaction(async tx=>{
        const live=(await tx.get(doc.ref)).data();
        if (live?.[field]===key && live.expiresAt<=now) tx.delete(doc.ref);
      });
      removed++;
    }
  }
  return removed;
}
