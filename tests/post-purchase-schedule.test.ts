import assert from "node:assert/strict";
import { DEFAULT_POST_PURCHASE_CONFIG, getPostPurchaseConfig, getPostPurchaseVersion, publishPostPurchaseConfig, savePostPurchaseDraft, validateConfig } from "../lib/post-purchase/config";
import { isPostalBusinessDay, schedulePostPurchaseStep } from "../lib/post-purchase/schedule";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
async function main() {
 await withSafeTestHarness(async()=>{
  const config=structuredClone(DEFAULT_POST_PURCHASE_CONFIG);
  assert.equal(config.steps.check_in.delayDays,10); assert.equal(config.steps.offer.delayDays,7);
  for (const date of [{year:2026,month:11,day:11},{year:2026,month:11,day:26},{year:2027,month:7,day:5},{year:2027,month:12,day:31}]) assert.equal(isPostalBusinessDay(date),false);
  assert.equal(isPostalBusinessDay({year:2026,month:11,day:10}),true);
  const due=await schedulePostPurchaseStep("check_in",Date.parse("2026-11-02T18:00:00Z"),0,config);
  assert.equal(new Date(due).toISOString(),"2026-11-17T16:00:00.000Z","10 business days exclude Veterans Day and weekends");
  const offer=await schedulePostPurchaseStep("offer",Date.parse("2026-03-06T16:00:00Z"),0,config);
  assert.equal(new Date(offer).toISOString(),"2026-03-13T15:00:00.000Z","7 calendar days retain Chicago 10am across DST");
  assert.throws(()=>validateConfig({...config,sendHourLocal:3}));
  assert.throws(()=>validateConfig({...config,mode:"bad" as any}));
  assert.throws(()=>validateConfig({...config,steps:{...config.steps,check_in:{...config.steps.check_in,enabled:false}}},true));
  assert.throws(()=>validateConfig({...config,steps:{...config.steps,check_in:{...config.steps.check_in,subject:"bad\nheader"}}}));
  const draft=await savePostPurchaseDraft({mode:"auto"},0,"synthetic");
  const published=await publishPostPurchaseConfig(draft.revision,"synthetic");
  assert.ok(published.autoActivatedAt);
  const later=await savePostPurchaseDraft({steps:{...draft.steps,check_in:{...draft.steps.check_in,subject:"Updated check-in"}}},draft.revision,"synthetic");
  assert.equal((await getPostPurchaseVersion(published.versionId))?.steps.check_in.subject,config.steps.check_in.subject,"published copy immutable");
  assert.equal((await getPostPurchaseConfig()).revision,later.revision);
  await assert.rejects(savePostPurchaseDraft({},draft.revision,"stale"));
  const resumed=await savePostPurchaseDraft({globalPaused:false},later.revision,"synthetic");
  assert.ok(resumed.resumedAt,"unpause timestamps require stale queue review");
 });
 console.log("Post-purchase schedule, holidays, DST, version pinning and revision checks passed.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
