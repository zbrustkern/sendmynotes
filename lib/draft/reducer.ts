import {
  DraftState,
  DRAFT_SCHEMA_VERSION,
  SelectedDesign,
  NoteDraft,
  AddressDraft,
  ScheduleDraft,
  AppliedOfferDraft,
  AttributionDraft,
  CustomGenerationState,
  PrivateUploadRecovery,
} from "./types";
import type { UploadSelection } from "@/lib/upload/contracts";

export type DraftAction =
  | {
      type: "SELECT_DESIGN";
      payload: {
        presetId?: string;
        customId?: string;
        imageUrl: string;
        title: string;
        source: "preset" | "custom" | "upload";
        occasion?: string;
        accepted?: boolean;
        uploadSelection?: UploadSelection;
      };
    }
  | { type: "ACCEPT_DESIGN" }
  | { type: "RESTORE_PRIVATE_UPLOAD"; payload: PrivateUploadRecovery & { replaceRecovery?: boolean } }
  | { type: "SET_PRIVATE_UPLOAD_RECOVERY"; payload: PrivateUploadRecovery | null }
  | { type: "UPLOAD_IDENTITY_CHANGED"; payload: string | null }
  | { type: "UPDATE_NOTE"; payload: Partial<NoteDraft> }
  | { type: "UPDATE_RECIPIENT"; payload: AddressDraft | null }
  | { type: "UPDATE_SENDER"; payload: AddressDraft | null }
  | { type: "UPDATE_SCHEDULE"; payload: ScheduleDraft | null }
  | { type: "SET_DISCOUNT_CODE"; payload: string | null }
  | { type: "SET_APPLIED_OFFER"; payload: AppliedOfferDraft | null }
  | { type: "SET_ATTRIBUTION"; payload: AttributionDraft | null }
  | { type: "SET_CUSTOM_GENERATION"; payload: Partial<CustomGenerationState> }
  | { type: "SET_CHECKOUT_SNAPSHOT"; payload: string | null }
  | { type: "SET_CHECKOUT_CONTACT"; payload: { email: string; choice: "untouched" | "provided" | "omitted" } }
  | { type: "SET_STEP"; payload: string }
  | { type: "MARK_COMPLETED" }
  | { type: "CLEAR_DRAFT"; payload?: { experienceVersion?: string } }
  | { type: "HYDRATE_DRAFT"; payload: DraftState };

export function createInitialDraft(experienceVersion = "candidate_v1"): DraftState {
  const now = Date.now();
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    draftRevision: 0,
    experienceVersion,
    selectedDesign: null,
    note: {
      salutation: "",
      text: "",
      signOff: "",
      style: "hwDavid",
    },
    recipient: null,
    sender: null,
    schedule: null,
    discountCode: null,
    appliedOffer: null,
    attribution: null,
    customGeneration: {
      status: "idle",
    },
    checkoutSnapshotId: null,
    checkoutContact: { email: "", choice: "untouched" },
    currentStep: "card",
    completed: false,
    lastCustomArtwork: null,
  };
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  const now = Date.now();

  switch (action.type) {
    case "SELECT_DESIGN": {
      const isSameSelection =
        state.selectedDesign !== null &&
        state.selectedDesign.imageUrl === action.payload.imageUrl &&
        state.selectedDesign.title === action.payload.title &&
        state.selectedDesign.source === action.payload.source;

      const isCustom = action.payload.source === "custom";
      const nextCustomArtwork = isCustom
        ? {
            presetId: action.payload.presetId,
            customId: action.payload.customId,
            imageUrl: action.payload.imageUrl,
            title: action.payload.title,
            source: "custom" as const,
            occasion: action.payload.occasion,
            accepted: true,
          }
        : state.lastCustomArtwork;

      // If already selected and accepted status is unchanged, don't unnecessarily increment
      if (
        isSameSelection &&
        state.selectedDesign &&
        (action.payload.accepted ?? false) === state.selectedDesign.accepted &&
        !state.privateUploadRecovery && !state.coverChoiceRequired && !state.uploadSelection
      ) {
        return state;
      }

      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        lastCustomArtwork: nextCustomArtwork,
        selectedDesign: {
          presetId: action.payload.presetId,
          customId: action.payload.customId,
          imageUrl: action.payload.imageUrl,
          title: action.payload.title,
          source: action.payload.source,
          occasion: action.payload.occasion,
          accepted: action.payload.accepted ?? false,
          uploadSelection: action.payload.uploadSelection,
        },
        uploadSelection: action.payload.uploadSelection ?? (action.payload.source === "upload" ? state.uploadSelection : null),
        uploadOwnerUid: action.payload.source === "upload" ? state.uploadOwnerUid : null,
        privateUploadRecovery: null,
        coverChoiceRequired: false,
      };
    }

    case "ACCEPT_DESIGN": {
      if (!state.selectedDesign) return state;
      if (state.selectedDesign.accepted) return state;

      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        selectedDesign: {
          ...state.selectedDesign,
          accepted: true,
        },
      };
    }

    case "RESTORE_PRIVATE_UPLOAD": {
      if (state.privateUploadRecovery && !action.payload.replaceRecovery && (
        state.privateUploadRecovery.ownerUid !== action.payload.ownerUid ||
        state.privateUploadRecovery.selection.designId !== action.payload.selection.designId ||
        state.privateUploadRecovery.selection.masterSha256 !== action.payload.selection.masterSha256 ||
        state.privateUploadRecovery.selection.revision !== action.payload.selection.revision
      )) return state;
      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        uploadSelection: action.payload.selection,
        uploadOwnerUid: action.payload.ownerUid,
        privateUploadRecovery: null,
        coverChoiceRequired: false,
        selectedDesign: { imageUrl: "", title: action.payload.selection.title, source: "upload", accepted: true, uploadSelection: action.payload.selection },
      };
    }

    case "SET_PRIVATE_UPLOAD_RECOVERY": {
      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        uploadSelection: null,
        uploadOwnerUid: null,
        privateUploadRecovery: action.payload,
        coverChoiceRequired: Boolean(action.payload),
        selectedDesign: state.selectedDesign?.source === "upload" || action.payload ? null : state.selectedDesign,
      };
    }

    case "UPLOAD_IDENTITY_CHANGED": {
      if (state.uploadSelection && state.uploadOwnerUid === action.payload) return state;
      const recovery = state.uploadSelection && state.uploadOwnerUid
        ? { ownerUid: state.uploadOwnerUid, selection: state.uploadSelection }
        : state.privateUploadRecovery ?? null;
      const hadPrivateCover = Boolean(state.uploadSelection || state.privateUploadRecovery || state.coverChoiceRequired);
      const hasExplicitCatalogCover = Boolean(state.selectedDesign && state.selectedDesign.source !== "upload");
      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        uploadSelection: null,
        uploadOwnerUid: null,
        privateUploadRecovery: recovery,
        coverChoiceRequired: hadPrivateCover && !hasExplicitCatalogCover,
        selectedDesign: state.selectedDesign?.source === "upload" ? null : state.selectedDesign,
        currentStep: hadPrivateCover && !hasExplicitCatalogCover ? "card" : state.currentStep,
      };
    }

    case "UPDATE_NOTE": {
      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        note: {
          ...state.note,
          ...action.payload,
        },
      };
    }

    case "UPDATE_RECIPIENT": {
      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        recipient: action.payload,
      };
    }

    case "UPDATE_SENDER": {
      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        sender: action.payload,
      };
    }

    case "UPDATE_SCHEDULE": {
      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        schedule: action.payload,
      };
    }

    case "SET_DISCOUNT_CODE": {
      if (state.discountCode === action.payload) return state;
      return {
        ...state,
        updatedAt: now,
        discountCode: action.payload,
      };
    }

    case "SET_APPLIED_OFFER": {
      return {
        ...state,
        updatedAt: now,
        appliedOffer: action.payload,
        discountCode: action.payload?.code ?? (action.payload === null ? null : state.discountCode),
      };
    }

    case "SET_ATTRIBUTION": {
      return {
        ...state,
        updatedAt: now,
        attribution: action.payload,
      };
    }

    case "SET_CUSTOM_GENERATION": {
      return {
        ...state,
        updatedAt: now,
        customGeneration: {
          ...state.customGeneration,
          ...action.payload,
        },
      };
    }

    case "SET_CHECKOUT_SNAPSHOT": {
      return {
        ...state,
        updatedAt: now,
        checkoutSnapshotId: action.payload,
      };
    }

    case "SET_CHECKOUT_CONTACT":
      return { ...state, updatedAt: now, draftRevision: state.draftRevision + 1, checkoutContact: action.payload };

    case "SET_STEP": {
      if (state.currentStep === action.payload) {
        return state;
      }
      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        currentStep: action.payload,
      };
    }

    case "MARK_COMPLETED": {
      return {
        ...state,
        updatedAt: now,
        draftRevision: state.draftRevision + 1,
        completed: true,
        currentStep: "confirmation",
      };
    }

    case "CLEAR_DRAFT": {
      return createInitialDraft(action.payload?.experienceVersion ?? state.experienceVersion);
    }

    case "HYDRATE_DRAFT": {
      return {
        ...action.payload,
        lastCustomArtwork:
          action.payload.lastCustomArtwork ??
          (action.payload.selectedDesign?.source === "custom"
            ? action.payload.selectedDesign
            : null),
      };
    }

    default:
      return state;
  }
}
