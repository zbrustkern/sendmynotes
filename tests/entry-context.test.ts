import assert from "node:assert/strict";
import { createInitialDraft } from "../lib/draft/reducer";
import { MemoryDraftStorage, loadDraft, saveDraft } from "../lib/draft/store";
import { loadEntryDraft, persistEntryDraft, clearEntryDraft, draftEntryContext } from "../lib/draft/entry-context";
import { getAllScenarios, parseScenarioNote } from "../lib/seo-scenarios";
import { DraftState, DraftStorage, DRAFT_STORAGE_KEY, DRAFT_EXPIRY_MS } from "../lib/draft/types";

const scenarios = getAllScenarios();
function starter(slug: string): DraftState {
  const scenario = scenarios.find(s => s.slug === slug)!;
  assert.ok(scenario, slug);
  const parsed = parseScenarioNote(scenario.handwrittenNote);
  return { ...createInitialDraft(), selectedDesign: {presetId: slug, imageUrl: scenario.coverUrl, title: scenario.h1Title, occasion: scenario.occasionName, source: "preset", accepted: true},
    note: {text: parsed.bodyNote, salutation: parsed.salutation, signOff: parsed.signOff, style: "hwKate"}, currentStep: "note" };
}
let checks = 0;
function check(name: string, fn: () => void) { fn(); checks++; console.log(`PASS ${name}`); }
const tab = new MemoryDraftStorage(), device = new MemoryDraftStorage();
const client = "preset:client-closing-appreciation", interview = "preset:after-job-interview";
check("legacy scenario identity is inferred independently of occasion", () => assert.equal(draftEntryContext(starter("client-closing-appreciation")), client));
check("fresh destination has no draft", () => assert.equal(loadEntryDraft(tab, device, interview).draft, null));
const edited = starter("client-closing-appreciation"); edited.note.text = "My intentional edited note"; edited.note.salutation = ""; edited.currentStep = "card";
saveDraft(edited, tab); saveDraft(edited, device);
check("different scenario never hydrates the previous note", () => {
  const result = loadEntryDraft(tab, device, interview); assert.equal(result.draft, null); assert.equal(result.hasStoredDraft, true);
});
persistEntryDraft(starter("after-job-interview"), tab, device, interview);
check("returning to previous destination preserves edits, empty greeting and gallery step", () => {
  const result = loadEntryDraft(tab, device, client).draft!; assert.equal(result.note.text, edited.note.text); assert.equal(result.note.salutation, ""); assert.equal(result.currentStep, "card");
});
check("new tab restores the right device draft", () => assert.equal(loadEntryDraft(new MemoryDraftStorage(), device, client).draft?.note.text, edited.note.text));
check("foreign tab draft does not hide a matching older device draft", () => {
  const otherTab = new MemoryDraftStorage(), olderDevice = new MemoryDraftStorage();
  saveDraft(starter("after-job-interview"), otherTab); saveDraft(edited, olderDevice);
  assert.equal(loadEntryDraft(otherTab, olderDevice, client).draft?.note.text, edited.note.text);
});
check("cover changes do not change draft ownership", () => {
  const changed = {...edited, selectedDesign: {...edited.selectedDesign!, presetId:"different-cover", imageUrl:"/presets/other.jpg"}};
  persistEntryDraft(changed, tab, device, client); assert.equal(draftEntryContext(loadDraft(tab)!), client);
  assert.equal(loadEntryDraft(tab, device, interview).draft?.selectedDesign?.presetId, "after-job-interview");
});
check("general custom artwork survives contextual visits", () => {
  const general = {...createInitialDraft(), note:{text:"Saved custom words", style:"hwKate"}, selectedDesign:{imageUrl:"/custom.png", title:"Custom",source:"custom" as const,accepted:true}};
  persistEntryDraft(general, tab, device,"general"); persistEntryDraft(starter("after-job-interview"),tab,device,interview);
  assert.equal(loadEntryDraft(tab,device,"general").draft?.note.text,"Saved custom words");
});
check("clearing one destination preserves the other drafts", () => {
  clearEntryDraft(tab, interview); clearEntryDraft(device,interview);
  assert.equal(loadEntryDraft(tab,device,interview).draft,null); assert.equal(loadEntryDraft(tab,device,client).draft?.note.text,edited.note.text);
});
check("expired scoped drafts are not restored", () => {
  const old = {...edited, updatedAt:Date.now()-DRAFT_EXPIRY_MS-1000};
  const storage = new MemoryDraftStorage(); storage.setItem(`${DRAFT_STORAGE_KEY}:entry:${client}`,JSON.stringify(old));
  assert.equal(loadEntryDraft(storage,null,client).draft,null);
});
check("storage quota never destroys the old draft to open another scenario", () => {
  const full = new MemoryDraftStorage(); saveDraft(edited,full);
  const quota: DraftStorage = {getItem:key=>full.getItem(key),removeItem:key=>full.removeItem(key),setItem:(key,value)=>{if(key!==DRAFT_STORAGE_KEY)throw Error("quota");full.setItem(key,value);}};
  persistEntryDraft(starter("after-job-interview"),quota,null,interview);
  assert.equal(loadDraft(full)?.note.text,edited.note.text);
});
check("invalid persisted context is discarded", () => {
  saveDraft({...edited,entryContext:"../foreign"},tab); assert.equal(loadDraft(tab)?.entryContext,undefined);
});
check("completed destination does not reappear as device draft", () => {
  persistEntryDraft({...starter("after-job-interview"),completed:true},tab,device,interview);
  assert.equal(loadEntryDraft(new MemoryDraftStorage(),device,interview).draft,null);
  assert.equal(loadEntryDraft(new MemoryDraftStorage(),device,client).draft?.note.text,edited.note.text);
});
console.log(`${checks} entry-context checks passed`);
