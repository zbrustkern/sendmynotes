import {
  DraftState,
  DraftStorage,
  DRAFT_SCHEMA_VERSION,
  DRAFT_STORAGE_KEY,
  DRAFT_EXPIRY_MS,
  ALLOWED_DRAFT_ROOT_KEYS,
  FORBIDDEN_STORAGE_KEYS,
} from "./types";
import { createInitialDraft } from "./reducer";

/**
 * In-memory fallback storage when sessionStorage is unavailable (e.g. SSR or private browsing blocks).
 */
export class MemoryDraftStorage implements DraftStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

function validUploadSelection(value: unknown): value is NonNullable<DraftState["uploadSelection"]> {
  if (!value || typeof value !== "object") return false;
  const upload = value as Record<string, unknown>;
  return upload.source === "upload" && upload.accepted === true &&
    typeof upload.designId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(upload.designId) &&
    typeof upload.masterSha256 === "string" && /^[a-f0-9]{64}$/i.test(upload.masterSha256) &&
    Number.isSafeInteger(upload.revision) && (upload.revision as number) > 0 &&
    typeof upload.title === "string" && upload.title.length <= 120;
}

function validPrivateUploadRecovery(value: unknown): DraftState["privateUploadRecovery"] {
  if (!value || typeof value !== "object") return null;
  const recovery = value as Record<string, unknown>;
  if (typeof recovery.ownerUid !== "string" || recovery.ownerUid.length < 1 || recovery.ownerUid.length > 128 || !validUploadSelection(recovery.selection)) return null;
  return { ownerUid: recovery.ownerUid, selection: recovery.selection };
}

/**
 * Gets default browser sessionStorage safely, falling back to MemoryDraftStorage if unavailable.
 */
export function getBrowserSessionStorage(): DraftStorage {
  if (typeof window !== "undefined" && window.sessionStorage) {
    try {
      // Test storage access (may throw in restricted iframe / private browsing)
      const testKey = "__smn_test__";
      window.sessionStorage.setItem(testKey, "1");
      window.sessionStorage.removeItem(testKey);
      return window.sessionStorage;
    } catch {
      return new MemoryDraftStorage();
    }
  }
  return new MemoryDraftStorage();
}

/**
 * Strips any forbidden or unallowlisted keys recursively or at the root to ensure
 * no client secrets, card data, or view tokens are ever written to storage.
 */
export function sanitizeDraftState(raw: unknown): DraftState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  // Check for any forbidden sensitive keys at the root
  for (const forbidden of FORBIDDEN_STORAGE_KEYS) {
    if (forbidden in record) {
      delete record[forbidden];
    }
  }

  // Ensure mandatory top-level properties exist with expected basic types
  if (typeof record.schemaVersion !== "number") return null;
  if (typeof record.createdAt !== "number") return null;
  if (typeof record.updatedAt !== "number") return null;
  if (typeof record.draftRevision !== "number") return null;
  if (typeof record.experienceVersion !== "string") return null;

  // Build clean sanitized object containing only allowlisted root keys
  const sanitized: Partial<DraftState> = {};
  for (const key of ALLOWED_DRAFT_ROOT_KEYS) {
    if (key in record) {
      sanitized[key] = record[key] as never;
    }
  }

  // Ensure note is well-formed
  const noteObj = record.note as Record<string, unknown> | undefined;
  sanitized.note = {
    salutation: typeof noteObj?.salutation === "string" ? noteObj.salutation : "",
    text: typeof noteObj?.text === "string" ? noteObj.text : "",
    signOff: typeof noteObj?.signOff === "string" ? noteObj.signOff : "",
    style: typeof noteObj?.style === "string" ? noteObj.style : "hwDavid",
  };

  // Ensure customGeneration is well-formed
  const customObj = record.customGeneration as Record<string, unknown> | undefined;
  sanitized.customGeneration = {
    status:
      customObj?.status === "generating" ||
      customObj?.status === "completed" ||
      customObj?.status === "failed"
        ? customObj.status
        : "idle",
    prompt: typeof customObj?.prompt === "string" ? customObj.prompt : undefined,
    resultImageUrl:
      typeof customObj?.resultImageUrl === "string" ? customObj.resultImageUrl : undefined,
    error: typeof customObj?.error === "string" ? customObj.error : undefined,
  };

  const contactObj = record.checkoutContact as Record<string, unknown> | undefined;
  sanitized.checkoutContact = {
    email: typeof contactObj?.email === "string" && contactObj.email.length <= 254 ? contactObj.email : "",
    choice: contactObj?.choice === "provided" || contactObj?.choice === "omitted" ? contactObj.choice : "untouched",
  };

  const activeUpload = validUploadSelection(record.uploadSelection) ? record.uploadSelection : null;
  const storedRecovery = validPrivateUploadRecovery(record.privateUploadRecovery);
  const ownerUid = typeof record.uploadOwnerUid === "string" && record.uploadOwnerUid.length > 0 && record.uploadOwnerUid.length <= 128
    ? record.uploadOwnerUid
    : null;
  sanitized.uploadSelection = null;
  sanitized.uploadOwnerUid = null;
  sanitized.privateUploadRecovery = (activeUpload && ownerUid ? { ownerUid, selection: activeUpload } : null) || storedRecovery;
  sanitized.coverChoiceRequired = activeUpload ? true : record.coverChoiceRequired === true;

  const selected = record.selectedDesign as Record<string, unknown> | null | undefined;
  if (selected && typeof selected === "object") {
    const isUpload = selected.source === "upload";
    sanitized.selectedDesign = {
      presetId: typeof selected.presetId === "string" ? selected.presetId : undefined,
      customId: typeof selected.customId === "string" ? selected.customId : undefined,
      imageUrl: isUpload ? "" : typeof selected.imageUrl === "string" ? selected.imageUrl : "",
      title: isUpload ? "" : typeof selected.title === "string" ? selected.title : "",
      source: isUpload ? "upload" : selected.source === "custom" ? "custom" : "preset",
      occasion: typeof selected.occasion === "string" ? selected.occasion : undefined,
      accepted: isUpload ? false : typeof selected.accepted === "boolean" ? selected.accepted : false,
      uploadSelection: undefined,
    };
    if (isUpload) sanitized.selectedDesign = null;
  }

  // Ensure lastCustomArtwork is well-formed if present
  if (record.lastCustomArtwork && typeof record.lastCustomArtwork === "object") {
    const customArt = record.lastCustomArtwork as Record<string, unknown>;
    sanitized.lastCustomArtwork = {
      presetId: typeof customArt.presetId === "string" ? customArt.presetId : undefined,
      customId: typeof customArt.customId === "string" ? customArt.customId : undefined,
      imageUrl: typeof customArt.imageUrl === "string" ? customArt.imageUrl : "",
      title: typeof customArt.title === "string" ? customArt.title : "",
      source: "custom",
      occasion: typeof customArt.occasion === "string" ? customArt.occasion : undefined,
      accepted: typeof customArt.accepted === "boolean" ? customArt.accepted : true,
    };
  } else if (record.lastCustomArtwork === null) {
    sanitized.lastCustomArtwork = null;
  }

  return sanitized as DraftState;
}

/**
 * Loads and validates a draft from the given storage interface.
 * Returns null and clears storage if expired or invalid.
 */
export function loadDraft(
  storage: DraftStorage,
  now: number = Date.now()
): DraftState | null {
  try {
    const rawString = storage.getItem(DRAFT_STORAGE_KEY);
    if (!rawString) {
      return null;
    }

    const parsed = JSON.parse(rawString);
    if (!parsed || typeof parsed !== "object") {
      storage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }

    // Version validation / migration
    if (parsed.schemaVersion !== DRAFT_SCHEMA_VERSION) {
      // If version is mismatched and no migration applies, discard safely
      storage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }

    // Expiry check: discard if older than 24 hours
    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0;
    if (now - updatedAt > DRAFT_EXPIRY_MS || updatedAt > now + 60000) {
      // Expired or clock skewed significantly
      storage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }

    // Sanitize and validate fields
    const sanitized = sanitizeDraftState(parsed);
    if (!sanitized) {
      storage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }

    return sanitized;
  } catch {
    // Corrupt JSON or storage failure
    try {
      storage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
    return null;
  }
}

/**
 * Saves a draft to the given storage interface.
 * Sanitizes and strips forbidden keys before serializing.
 */
export function saveDraft(
  draft: DraftState,
  storage: DraftStorage,
  now: number = Date.now()
): boolean {
  try {
    const sanitized = sanitizeDraftState({
      ...draft,
      updatedAt: now,
    });

    if (!sanitized) return false;

    // Double check that no forbidden key is in the serialized object
    const serializedRecord: Record<string, unknown> = {};
    for (const key of ALLOWED_DRAFT_ROOT_KEYS) {
      if (sanitized[key] !== undefined) {
        serializedRecord[key] = sanitized[key];
      }
    }

    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(serializedRecord));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears the stored draft.
 */
export function clearDraft(storage: DraftStorage): void {
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
