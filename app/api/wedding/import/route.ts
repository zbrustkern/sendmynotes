import { NextRequest,NextResponse } from "next/server";
import { requireWeddingActor, requireWeddingPilot, WeddingError } from "@/lib/wedding/server";
import { enforceWeddingNetworkRateLimit } from "@/lib/wedding/rate-limit";
import { checkAndStageImport, claimImportAttempt, restoreImport } from "@/lib/wedding/import-storage";
import { ImportCheckError, readBoundedImport } from "@/lib/wedding/import-runner";
import { inspectWeddingAddress, previewWeddingImport } from "@/lib/wedding/import-preview";
import type { ImportFormat } from "@/lib/wedding/import-contract";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Vary":"Cookie, Authorization, Origin","X-Content-Type-Options":"nosniff"};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
function problem(error:unknown) {
  const e=error as {status?:number;code?:string;message?:string};
  if ((error instanceof ImportCheckError || error instanceof WeddingError) && e.status) return json({error:e.message,code:e.code},e.status);
  return json({error:"Your list could not be checked. Try again or add a household manually.",code:"retryable"},503);
}
async function authorizeImportActor(req:NextRequest) {
  return process.env.WEDDING_REQUIRE_PILOT==="true" ? requireWeddingPilot(req) : requireWeddingActor(req);
}
export async function GET(req:NextRequest) {
  try {
    const actor=await authorizeImportActor(req), id=req.nextUrl.searchParams.get("id") || "";
    const preview=previewWeddingImport(await restoreImport(actor.projectId,id),id);
    await authorizeImportActor(req);
    return json(preview);
  } catch(e) { return problem(e); }
}
export async function POST(req:NextRequest) {
  let release:(()=>Promise<unknown>)|undefined;
  try {
    const actor=await authorizeImportActor(req);
    await enforceWeddingNetworkRateLimit(req,"import");
    const params=req.nextUrl.searchParams, action=params.get("action");
    if(action==="map" || action==="postal") {
      let payload;
      try { payload=JSON.parse((await readBoundedImport(req,128*1024)).toString("utf8")); }
      catch(e) { if(e instanceof ImportCheckError) throw e; throw new ImportCheckError("Check the selected fields."); }
      if(!payload || typeof payload!=="object") throw new ImportCheckError("Check the selected fields.");
      release=await claimImportAttempt(actor.projectId);
      if(action==="postal") {
        const address:Record<string,string>={};
        for(const f of ["street1","city","state","zip","country"]) address[f]=typeof payload.address?.[f]==="string"?payload.address[f].trim().slice(0,180):"";
        const structural=inspectWeddingAddress(address as Parameters<typeof inspectWeddingAddress>[0]);
        // Synthetic responses exercise review, never represent real postal verification.
        const scenario=["valid","ambiguous","missing_unit","unavailable"].includes(payload.scenario)?payload.scenario:"valid";
        const simulated=process.env.STAGING_REVIEW_ONLY==="true" && address.country==="US";
        return json({ ...structural, source:simulated?"staging_postal_fixture":"structure",status:!structural.complete?"incomplete":simulated?scenario:"structurally_complete" });
      }
      const parsed=await restoreImport(actor.projectId,payload.importId);
      await authorizeImportActor(req);
      try { return json(previewWeddingImport(parsed,payload.importId,payload.mappings,payload.sheets)); }
      catch(e) { throw new ImportCheckError(e instanceof Error?e.message:"Check your column mappings."); }
    }
    if(action) return json({error:"Choose a supported import action."},400);
    const format=params.get("format");
    if(!format || !["csv","tsv","xlsx","txt","vcf"].includes(format)) return json({error:"Choose a CSV, TSV, vCard, XLSX or plain text file."},415);
    release=await claimImportAttempt(actor.projectId);
    const bytes=await readBoundedImport(req);
    const {parsed,id}=await checkAndStageImport(actor.projectId,format as ImportFormat,bytes);
    await authorizeImportActor(req);
    try { return json(previewWeddingImport(parsed,id)); } catch(e) { throw new ImportCheckError(e instanceof Error?e.message:"Check the column headings."); }
  } catch(e) { return problem(e); }
  finally { if(release) await release().catch(()=>{}); }
}
