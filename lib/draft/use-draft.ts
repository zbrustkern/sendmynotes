"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import { DraftStorage } from "./types";
import { draftReducer, createInitialDraft } from "./reducer";
import { getBrowserSessionStorage, getBrowserLocalStorage } from "./store";
import { loadEntryDraft, persistEntryDraft, clearEntryDraft } from "./entry-context";

interface UseDraftOptions {
  storage?: DraftStorage;
  experienceVersion?: string;
  initialPresetId?: string;
  initialPresetTitle?: string;
  initialPresetUrl?: string;
  initialOccasion?: string;
  initialHandwrittenNote?: string;
  initialSalutation?: string;
  initialSignOff?: string;
  initialFontStyleId?: string;
}

export function useDraft(options: UseDraftOptions = {}) {
  const {
    storage = getBrowserSessionStorage(),
    experienceVersion = "candidate_v1",
    initialPresetId,
    initialPresetTitle,
    initialPresetUrl,
    initialOccasion,
    initialHandwrittenNote,
    initialSalutation,
    initialSignOff,
    initialFontStyleId,
  } = options;

  const [isLoaded, setIsLoaded] = useState(false);
  const [wasRestored, setWasRestored] = useState(false);
  const [hasStoredDraft, setHasStoredDraft] = useState(false);
  const entryContext = initialPresetId ? `preset:${initialPresetId}` : "general";
  const [saveLocation, setSaveLocation] = useState<"device" | "tab" | "unavailable">("unavailable");
  const [state, dispatch] = useReducer(draftReducer, createInitialDraft(experienceVersion));
  const storageRef = useRef<DraftStorage>(storage);
  storageRef.current = storage;
  const deviceStorage = options.storage ? null : getBrowserLocalStorage();
  const deviceRef = useRef(deviceStorage);
  deviceRef.current = deviceStorage;

  // Hydrate on mount
  useEffect(() => {
    const { draft: existing, hasStoredDraft: stored } = loadEntryDraft(storageRef.current, deviceRef.current, entryContext);
    setHasStoredDraft(stored);
    if (existing) {
      dispatch({ type: "HYDRATE_DRAFT", payload: existing });
      const untouchedStarter = Boolean(initialPresetId && existing.selectedDesign?.presetId === initialPresetId &&
        existing.note.text === (initialHandwrittenNote || "") && existing.note.salutation === (initialSalutation || "") &&
        existing.note.signOff === (initialSignOff || "") && existing.note.style === (initialFontStyleId || "hwDavid") &&
        !existing.recipient && !existing.sender);
      setWasRestored(!existing.completed && !untouchedStarter && Boolean(existing.selectedDesign?.imageUrl || existing.customGeneration.resultImageUrl || existing.note.text || existing.note.salutation || existing.note.signOff));
    } else {
      dispatch({ type: "HYDRATE_DRAFT", payload: { ...createInitialDraft(experienceVersion), entryContext } });
      // If an initial preset or curated scenario was passed via URL/context:
      if (initialPresetUrl && initialPresetTitle) {
        dispatch({
          type: "SELECT_DESIGN",
          payload: {
            presetId: initialPresetId,
            imageUrl: initialPresetUrl,
            title: initialPresetTitle,
            occasion: initialOccasion,
            source: "preset",
            accepted: Boolean(initialHandwrittenNote), // Pre-seeded curated scenario starts accepted
          },
        });
      }
      if (initialHandwrittenNote || initialSalutation || initialSignOff) {
        dispatch({
          type: "UPDATE_NOTE",
          payload: {
            salutation: initialSalutation || "",
            text: initialHandwrittenNote || "",
            signOff: initialSignOff || "",
            style: initialFontStyleId || "hwDavid",
          },
        });
      }
      if (initialPresetUrl && initialPresetTitle) dispatch({ type: "SET_STEP", payload: "note" });
    }
    setIsLoaded(true);
  }, [
    initialPresetId,
    initialPresetUrl,
    initialPresetTitle,
    initialOccasion,
    initialHandwrittenNote,
    initialSalutation,
    initialSignOff,
    initialFontStyleId,
    entryContext,
    experienceVersion,
  ]);

  // Persist state updates
  useEffect(() => {
    if (!isLoaded) return;
    setSaveLocation(persistEntryDraft(state, storageRef.current, deviceRef.current, entryContext));
  }, [state, isLoaded, entryContext]);

  const handleClearDraft = useCallback(() => {
    clearEntryDraft(storageRef.current, entryContext);
    if (deviceRef.current) clearEntryDraft(deviceRef.current, entryContext);
    setWasRestored(false);
    dispatch({ type: "CLEAR_DRAFT", payload: { experienceVersion } });
  }, [experienceVersion, entryContext]);

  return {
    draft: state,
    dispatch,
    clearDraft: handleClearDraft,
    isLoaded,
    wasRestored,
    hasStoredDraft,
    saveLocation,
  };
}
