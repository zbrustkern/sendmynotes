import { getAllScenarios } from "../seo-scenarios";
import { DraftState, DraftStorage, DRAFT_STORAGE_KEY } from "./types";
import { clearDraft, loadDraft, saveDraft, MemoryDraftStorage } from "./store";

const scenarioIds = new Set(getAllScenarios().map(scenario => scenario.slug));

/** Stable entry identity, independent of the currently selected cover and UTMs. */
export function draftEntryContext(draft: DraftState): string {
  if (draft.entryContext) return draft.entryContext;
  // Older scenario drafts stored the scenario slug in presetId. Ordinary gallery
  // selections and custom artwork still belong to the general sending flow.
  const id = draft.selectedDesign?.presetId;
  return id && scenarioIds.has(id) ? `preset:${id}` : "general";
}

function scopedStorage(storage: DraftStorage, context: string): DraftStorage {
  const scopedKey = `${DRAFT_STORAGE_KEY}:entry:${context}`;
  return {
    getItem: () => storage.getItem(scopedKey),
    setItem: (_key, value) => storage.setItem(scopedKey, value),
    removeItem: () => storage.removeItem(scopedKey),
  };
}

export function loadEntryDraft(tab: DraftStorage, device: DraftStorage | null, context: string) {
  const tabActive = loadDraft(tab);
  const deviceActive = device ? loadDraft(device) : null;
  // Archive before switching destinations; never discard someone's edited note.
  for (const storage of [tab, device]) {
    if (!storage) continue;
    const previous = loadDraft(storage);
    if (previous && draftEntryContext(previous) !== context) {
      saveDraft(previous, scopedStorage(storage, draftEntryContext(previous)), previous.updatedAt);
    }
  }
  const matching = (draft: DraftState | null) => draft && draftEntryContext(draft) === context ? draft : null;
  const draft = matching(tabActive) || loadDraft(scopedStorage(tab, context)) ||
    matching(deviceActive) || (device ? loadDraft(scopedStorage(device, context)) : null);
  return { draft, hasStoredDraft: Boolean(tabActive || deviceActive || draft) };
}

export function persistEntryDraft(draft: DraftState, tab: DraftStorage, device: DraftStorage | null, context: string): "device" | "tab" | "unavailable" {
  const tagged = { ...draft, entryContext: context };
  const persist = (storage: DraftStorage, isDevice: boolean) => {
    const scoped = scopedStorage(storage, context);
    if (draft.completed && isDevice) {
      clearDraft(scoped);
      const active = loadDraft(storage);
      if (active && draftEntryContext(active) === context) clearDraft(storage);
      return false;
    }
    const previous = loadDraft(storage);
    // If storage is full, retain the old active draft instead of overwriting its
    // only copy. The new destination can still work without durable storage.
    const canReplaceActive = !previous || draftEntryContext(previous) === context ||
      saveDraft(previous, scopedStorage(storage, draftEntryContext(previous)), previous.updatedAt);
    const scopedSaved = saveDraft(tagged, scoped);
    const activeSaved = canReplaceActive && saveDraft(tagged, storage);
    return scopedSaved || activeSaved;
  };
  const tabSaved = persist(tab, false);
  if (device && persist(device, true)) return "device";
  return tabSaved && !(tab instanceof MemoryDraftStorage) ? "tab" : "unavailable";
}

export function clearEntryDraft(storage: DraftStorage, context: string) {
  clearDraft(scopedStorage(storage, context));
  const active = loadDraft(storage);
  if (!active || draftEntryContext(active) === context) clearDraft(storage);
}
