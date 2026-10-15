"use client";

import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import { DraftState, DraftStorage } from "./types";
import { draftReducer, DraftAction, createInitialDraft } from "./reducer";
import { loadDraft, saveDraft, clearDraft as clearStorageDraft, getBrowserSessionStorage } from "./store";
import { canonicalOccasion } from "../card-presets";

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
  const [state, dispatch] = useReducer(draftReducer, createInitialDraft(experienceVersion));
  const storageRef = useRef<DraftStorage>(storage);
  storageRef.current = storage;

  // Hydrate on mount
  useEffect(() => {
    const existing = loadDraft(storageRef.current);
    const existingOccasion = canonicalOccasion(existing?.selectedDesign?.occasion);
    const targetOccasion = canonicalOccasion(initialOccasion || "thinking-of-you");
    const isOccasionMismatch = Boolean(
      existing &&
      existingOccasion !== targetOccasion
    );

    if (existing && !isOccasionMismatch) {
      dispatch({ type: "HYDRATE_DRAFT", payload: existing });
    } else {
      if (isOccasionMismatch) {
        // Cross-occasion draft detected: purge foreign draft from storage immediately
        clearStorageDraft(storageRef.current);
        // Retain existing delivery addresses so user doesn't have to retype them
        if (existing?.recipient) {
          dispatch({ type: "UPDATE_RECIPIENT", payload: existing.recipient });
        }
        if (existing?.sender) {
          dispatch({ type: "UPDATE_SENDER", payload: existing.sender });
        }
      }
      // If an initial preset or curated scenario was passed via URL/context:
      if (initialPresetUrl && initialPresetTitle) {
        dispatch({
          type: "SELECT_DESIGN",
          payload: {
            presetId: initialPresetId,
            imageUrl: initialPresetUrl,
            title: initialPresetTitle,
            occasion: initialOccasion || targetOccasion,
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
  ]);

  // Persist state updates
  useEffect(() => {
    if (!isLoaded) return;
    saveDraft(state, storageRef.current);
  }, [state, isLoaded]);

  const handleClearDraft = useCallback(() => {
    clearStorageDraft(storageRef.current);
    dispatch({ type: "CLEAR_DRAFT", payload: { experienceVersion } });
  }, [experienceVersion]);

  return {
    draft: state,
    dispatch,
    clearDraft: handleClearDraft,
    isLoaded,
  };
}
