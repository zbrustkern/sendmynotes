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
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      // Test storage access (may throw in restricted iframe / private browsing)
      const testKey = "__smn_test__";
      window.sessionStorage.setItem(testKey, "1");
      window.sessionStorage.removeItem(testKey);
      return window.sessionStorage;
    }
  } catch { /* Browser storage can be blocked, including its getter. */ }
  return new MemoryDraftStorage();
}

export function getBrowserLocalStorage(): DraftStorage | null {
  try {
    if (typeof window !== "undefined") return window.localStorage;
  } catch { /* Keep the tab usable when persistent storage is blocked. */ }
  return null;
}

/** Prefer this tab's work; a new tab falls back to the full device draft. */
export function loadResumableDraft(tab: DraftStorage, device: DraftStorage | null): DraftState | null {
  return loadDraft(tab) || (device ? loadDraft(device) : null);
}

export function persistResumableDraft(draft: DraftState, tab: DraftStorage, device: DraftStorage | null): "device" | "tab" | "unavailable" {
  const tabSaved = saveDraft(draft, tab);
  // Completed cards must not reappear as an unpaid draft in a new tab.
  if (draft.completed) {
    if (device) clearDraft(device);
    return tabSaved && !(tab instanceof MemoryDraftStorage) ? "tab" : "unavailable";
  }
  if (device && saveDraft(draft, device)) return "device";
  return tabSaved && !(tab instanceof MemoryDraftStorage) ? "tab" : "unavailable";
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
  sanitized.entryContext = typeof record.entryContext === "string" &&
    /^(general|preset:[a-z0-9-]{1,120})$/.test(record.entryContext)
    ? record.entryContext : undefined;
  const noteObj = record.note as Record<string, unknown> | undefined;
  sanitized.note = {
    salutation: typeof noteObj?.salutation === "string" ? noteObj.salutation : "",
    text: typeof noteObj?.text === "string" ? noteObj.text : "",
    signOff: typeof noteObj?.signOff === "string" ? noteObj.signOff : "",
    style: typeof noteObj?.style === "string" ? noteObj.style : "hwDavid",
  };

  // Keep only well-shaped multi-send data. Old schema-v1 drafts naturally have
  // no batch key and continue through the legacy single-recipient path.
  const multi = record.multiSend as Record<string, unknown> | null | undefined;
  if (multi?.version === 1 && Array.isArray(multi.recipients) && multi.recipients.length >= 1 && multi.recipients.length <= 25) {
    const recipients = multi.recipients.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      .map((item) => {
        const greeting = item.greeting as Record<string, unknown> | undefined;
        const address = item.address as Record<string, unknown> | undefined;
        if (typeof item.id !== "string" || !item.id || !address || typeof address !== "object") return null;
        const cleanAddress = {
          name: typeof address.name === "string" ? address.name : "",
          addressLine1: typeof address.addressLine1 === "string" ? address.addressLine1 : "",
          addressLine2: typeof address.addressLine2 === "string" ? address.addressLine2 : undefined,
          city: typeof address.city === "string" ? address.city : "",
          state: typeof address.state === "string" ? address.state : "",
          zip: typeof address.zip === "string" ? address.zip : "",
          country: typeof address.country === "string" ? address.country : "US",
        };
        const cleanGreeting = greeting?.mode === "custom" && typeof greeting.text === "string"
          ? { mode: "custom" as const, text: greeting.text }
          : { mode: "inherit" as const };
        return { id: item.id.slice(0, 128), address: cleanAddress, greeting: cleanGreeting,
          householdAcknowledgedWith: Array.isArray(item.householdAcknowledgedWith) ? item.householdAcknowledgedWith.filter((entry): entry is {id:string;addressKey:string} => Boolean(entry && typeof entry === "object" && typeof (entry as any).id === "string" && typeof (entry as any).addressKey === "string")).slice(0,25) : undefined };
      }).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (recipients.length) {
      const batchNote = multi.note as Record<string, unknown> | undefined;
      sanitized.multiSend = { version: 1, checkoutId: typeof multi.checkoutId === "string" && multi.checkoutId.length <= 128 ? multi.checkoutId : "", originWasDeferred: multi.originWasDeferred === true, recipients, note: {
        salutation: typeof batchNote?.salutation === "string" ? batchNote.salutation : "",
        text: typeof batchNote?.text === "string" ? batchNote.text : "",
        signOff: typeof batchNote?.signOff === "string" ? batchNote.signOff : "",
        style: typeof batchNote?.style === "string" ? batchNote.style : "hwDavid",
      } };
    }
  } else sanitized.multiSend = null;
  if (record.multiSendUndo && typeof record.multiSendUndo === "object") {
    const backup = sanitizeDraftState({ ...record, multiSend: record.multiSendUndo, multiSendUndo: null });
    sanitized.multiSendUndo = backup?.multiSend || null;
  } else sanitized.multiSendUndo = null;

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
  const library = record.accountImage as Record<string, unknown> | undefined;
  const validLibrary = library && typeof library.imageId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(library.imageId)
    && Number.isSafeInteger(library.version) && Number(library.version) > 0
    && typeof library.masterSha256 === 'string' && /^[a-f0-9]{64}$/.test(library.masterSha256);
  sanitized.accountImage = validLibrary ? { imageId: library.imageId as string, version: library.version as number, masterSha256: library.masterSha256 as string } : null;
  sanitized.accountOwnerUid = typeof record.accountOwnerUid === 'string' && record.accountOwnerUid.length <= 128 ? record.accountOwnerUid : null;
  if (selected && typeof selected === "object") {
    const isUpload = selected.source === "upload";
    const isLibrary = selected.source === 'account';
    sanitized.selectedDesign = {
      presetId: typeof selected.presetId === "string" ? selected.presetId : undefined,
      customId: typeof selected.customId === "string" ? selected.customId : undefined,
      imageUrl: isUpload || isLibrary ? "" : typeof selected.imageUrl === "string" ? selected.imageUrl : "",
      title: isUpload || isLibrary ? "" : typeof selected.title === "string" ? selected.title : "",
      source: isUpload ? "upload" : isLibrary ? "account" : selected.source === "custom" ? "custom" : "preset",
      occasion: typeof selected.occasion === "string" ? selected.occasion : undefined,
      accepted: isUpload ? false : typeof selected.accepted === "boolean" ? selected.accepted : false,
      uploadSelection: undefined,
    };
    if (isUpload) sanitized.selectedDesign = null;
    if (isLibrary && (!validLibrary || !sanitized.accountOwnerUid)) { sanitized.selectedDesign = null; sanitized.coverChoiceRequired = true; }
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
