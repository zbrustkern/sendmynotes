import * as admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { Order, ImageCachePoolItem, DiscountCode, SystemIncident } from "./types";
import { optimizeCoverImage } from "./image-optimizer";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "mock-firestore.json");

// Mock Document and Query Snapshots
class MockDocumentSnapshot<T = unknown> {
  constructor(private _id: string, private _data: T | undefined) {}
  get id() {
    return this._id;
  }
  get exists() {
    return this._data !== undefined;
  }
  data(): T | undefined {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined;
  }
}

class MockQuerySnapshot<T = unknown> {
  constructor(private _docs: MockDocumentSnapshot<T>[]) {}
  get docs() {
    return this._docs;
  }
  get empty() {
    return this._docs.length === 0;
  }
  get size() {
    return this._docs.length;
  }
  forEach(callback: (doc: MockDocumentSnapshot<T>) => void) {
    this._docs.forEach(callback);
  }
}

class MockDocRef<T = unknown> {
  constructor(private _collection: MockCollection<T>, private _id: string) {}
  get id() {
    return this._id;
  }
  async get(): Promise<MockDocumentSnapshot<T>> {
    const data = this._collection.store.get(this._id);
    return new MockDocumentSnapshot<T>(this._id, data);
  }
  async set(data: T, options?: { merge?: boolean }): Promise<void> {
    if (options?.merge && this._collection.store.has(this._id)) {
      const existing = this._collection.store.get(this._id);
      this._collection.store.set(this._id, { ...existing, ...data });
    } else {
      this._collection.store.set(this._id, JSON.parse(JSON.stringify(data)));
    }
    this._collection.notifyChanged();
  }
  async update(data: Partial<T>): Promise<void> {
    const existing = this._collection.store.get(this._id);
    if (!existing) {
      throw new Error(`Document ${this._id} does not exist.`);
    }
    this._collection.store.set(this._id, { ...existing, ...data });
    this._collection.notifyChanged();
  }
  async delete(): Promise<void> {
    this._collection.store.delete(this._id);
    this._collection.notifyChanged();
  }
}

class MockCollection<T = Record<string, unknown>> {
  public store = new Map<string, T>();

  constructor(private firestore?: MockFirestore) {}

  public notifyChanged() {
    if (this.firestore) {
      this.firestore.scheduleSave();
    }
  }

  doc(id?: string): MockDocRef<T> {
    const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return new MockDocRef<T>(this, docId);
  }

  limit(n: number) {
    return {
      get: async (): Promise<MockQuerySnapshot<T>> => {
        const results: MockDocumentSnapshot<T>[] = [];
        for (const [id, data] of this.store.entries()) {
          results.push(new MockDocumentSnapshot<T>(id, data));
          if (results.length >= n) break;
        }
        return new MockQuerySnapshot<T>(results);
      },
    };
  }

  where(field: string, op: string, value: unknown) {
    return {
      limit: (n: number) => ({
        get: async (): Promise<MockQuerySnapshot<T>> => {
          const results: MockDocumentSnapshot<T>[] = [];
          for (const [id, data] of this.store.entries()) {
            const val = (data as Record<string, unknown>)[field];
            if (op === "==" && val === value) {
              results.push(new MockDocumentSnapshot<T>(id, data));
            }
            if (results.length >= n) break;
          }
          return new MockQuerySnapshot<T>(results);
        },
      }),
      get: async (): Promise<MockQuerySnapshot<T>> => {
        const results: MockDocumentSnapshot<T>[] = [];
        for (const [id, data] of this.store.entries()) {
          const val = (data as Record<string, unknown>)[field];
          if (op === "==" && val === value) {
            results.push(new MockDocumentSnapshot<T>(id, data));
          }
        }
        return new MockQuerySnapshot<T>(results);
      },
    };
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc") {
    return {
      limit: (n: number) => ({
        get: async (): Promise<MockQuerySnapshot<T>> => {
          const sorted = Array.from(this.store.entries()).sort((a, b) => {
            const valA = (a[1] as Record<string, unknown>)[field] as number | string | undefined;
            const valB = (b[1] as Record<string, unknown>)[field] as number | string | undefined;
            if (valA === undefined) return 1;
            if (valB === undefined) return -1;
            return direction === "desc" ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
          });
          const results = sorted.slice(0, n).map(([id, data]) => new MockDocumentSnapshot<T>(id, data));
          return new MockQuerySnapshot<T>(results);
        },
      }),
      get: async (): Promise<MockQuerySnapshot<T>> => {
        const sorted = Array.from(this.store.entries()).sort((a, b) => {
          const valA = (a[1] as Record<string, unknown>)[field] as number | string | undefined;
          const valB = (b[1] as Record<string, unknown>)[field] as number | string | undefined;
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;
          return direction === "desc" ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
        });
        const results = sorted.map(([id, data]) => new MockDocumentSnapshot<T>(id, data));
        return new MockQuerySnapshot<T>(results);
      },
    };
  }

  async get(): Promise<MockQuerySnapshot<T>> {
    const results: MockDocumentSnapshot<T>[] = [];
    for (const [id, data] of this.store.entries()) {
      results.push(new MockDocumentSnapshot<T>(id, data));
    }
    return new MockQuerySnapshot<T>(results);
  }
}

class MockFirestore {
  private collections = new Map<string, MockCollection>();
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (typeof process !== "undefined" && fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        for (const [colName, docs] of Object.entries(parsed)) {
          const col = this.collection(colName);
          if (docs && typeof docs === "object") {
            for (const [docId, docData] of Object.entries(docs as Record<string, unknown>)) {
              col.store.set(docId, docData as Record<string, unknown>);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[MockFirestore] Notice reading persistent store:", err);
    }
  }

  public scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      this.saveToDisk();
    }, 150);
  }

  public saveToDisk() {
    try {
      if (typeof process !== "undefined") {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const serialized: Record<string, Record<string, unknown>> = {};
        for (const [colName, col] of this.collections.entries()) {
          serialized[colName] = {};
          for (const [docId, docData] of col.store.entries()) {
            serialized[colName][docId] = docData;
          }
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(serialized, null, 2), "utf-8");
      }
    } catch (err) {
      console.warn("[MockFirestore] Notice saving store to disk:", err);
    }
  }

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockCollection(this));
    }
    return this.collections.get(name)!;
  }
}

const mockFirestoreInstance = new MockFirestore();

function configureDb(db: admin.firestore.Firestore): admin.firestore.Firestore {
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch (_e) {
    // Ignore if settings have already been locked by an earlier call
  }
  return db;
}

// Recursively strips any properties with `undefined` values to satisfy Firestore
export function sanitizeFirestoreData<T extends Record<string, any>>(data: T): T {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map((item) =>
      typeof item === "object" && item !== null ? sanitizeFirestoreData(item) : item
    ) as unknown as T;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      if (value !== null && typeof value === "object" && !(value instanceof Date)) {
        cleaned[key] = sanitizeFirestoreData(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned as T;
}

// Singleton check for Real vs Mock Firebase Admin
function initializeFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (admin.apps.length > 0) {
    return { db: configureDb(admin.firestore()), isMock: false };
  }

  // 1. Explicit Service Account credentials
  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log("[Firebase Admin] Connected to live Cloud Firestore via Service Account:", projectId);
      return { db: configureDb(admin.firestore()), isMock: false };
    } catch (err) {
      console.warn("[Firebase Admin] Error initializing live SDK with cert, falling back:", err);
    }
  }

  // 2. Google Cloud / Firebase App Hosting / Cloud Run Application Default Credentials
  if (
    process.env.K_SERVICE ||
    process.env.FIREBASE_CONFIG ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    (process.env.NODE_ENV === "production" && projectId)
  ) {
    try {
      admin.initializeApp({
        projectId: projectId || process.env.GOOGLE_CLOUD_PROJECT,
      });
      console.log("[Firebase Admin] Connected to live Cloud Firestore via App Hosting ADC:", projectId);
      return { db: configureDb(admin.firestore()), isMock: false };
    } catch (err) {
      console.warn("[Firebase Admin] Error initializing ADC Firestore:", err);
    }
  }

  console.log("[Firebase Admin] Using disk-persisted mock Firestore store (.data/mock-firestore.json).");
  return { db: mockFirestoreInstance as unknown as admin.firestore.Firestore, isMock: true };
}

const { db: firestoreDb, isMock: isFirestoreMock } = initializeFirebase();

export { firestoreDb, isFirestoreMock };

// Collection Helpers
export const ORDERS_COLLECTION = "orders";
export const IMAGE_CACHE_POOL_COLLECTION = "image_cache_pool";
export const SYSTEM_INCIDENTS_COLLECTION = "system_incidents";
export const ADMIN_AUTH_ATTEMPTS_COLLECTION = "admin_auth_attempts";

export const getOrdersCollection = () => firestoreDb.collection(ORDERS_COLLECTION);
export const getImageCachePoolCollection = () => firestoreDb.collection(IMAGE_CACHE_POOL_COLLECTION);
export const getSystemIncidentsCollection = () => firestoreDb.collection(SYSTEM_INCIDENTS_COLLECTION);
export const getAdminAuthAttemptsCollection = () => firestoreDb.collection(ADMIN_AUTH_ATTEMPTS_COLLECTION);

export async function recordSystemIncident(
  incident: Omit<SystemIncident, "id" | "createdAt" | "resolved">
): Promise<void> {
  try {
    const id = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullIncident: SystemIncident = sanitizeFirestoreData({
      ...incident,
      id,
      resolved: false,
      createdAt: Date.now(),
    });
    await getSystemIncidentsCollection().doc(id).set(fullIncident);
  } catch (err) {
    console.error("[Record System Incident Error]", err);
  }
}

export async function saveOrder(order: Order): Promise<void> {
  const sanitized = sanitizeFirestoreData({ ...order });
  if (sanitized.frontImageUrl && sanitized.frontImageUrl.length > 800000) {
    try {
      sanitized.frontImageUrl = await optimizeCoverImage(sanitized.frontImageUrl);
    } catch (err) {
      console.warn("[saveOrder] Image optimization notice:", err);
    }
  }
  await getOrdersCollection().doc(sanitized.id).set(sanitized);
}

export async function getOrderById(orderId: string): Promise<Order | null> {
  const doc = await getOrdersCollection().doc(orderId).get();
  if (!doc.exists) return null;
  return doc.data() as Order;
}

export async function updateOrderStatus(
  orderId: string,
  update: Partial<Order>
): Promise<void> {
  const sanitized = sanitizeFirestoreData({
    ...update,
    updatedAt: Date.now(),
  });
  await getOrdersCollection().doc(orderId).update(sanitized);
}

export async function saveImageCacheItem(item: ImageCachePoolItem): Promise<void> {
  const sanitized = { ...item };
  if (sanitized.imageUrl && sanitized.imageUrl.length > 800000) {
    try {
      sanitized.imageUrl = await optimizeCoverImage(sanitized.imageUrl);
    } catch (err) {
      console.warn("[saveImageCacheItem] Image optimization notice:", err);
    }
  }
  await getImageCachePoolCollection().doc(sanitized.id).set(sanitized);
}

export async function claimImageCacheItem(id: string): Promise<void> {
  const doc = await getImageCachePoolCollection().doc(id).get();
  if (doc.exists) {
    await getImageCachePoolCollection().doc(id).update({
      status: "CLAIMED",
    });
  }
}

// System Config Helpers
export const SYSTEM_CONFIG_COLLECTION = "system_config";
export const getSystemConfigCollection = () => firestoreDb.collection(SYSTEM_CONFIG_COLLECTION);

export async function getSystemConfig<T = Record<string, unknown>>(configId: string): Promise<T | null> {
  const doc = await getSystemConfigCollection().doc(configId).get();
  if (!doc.exists) return null;
  return doc.data() as T;
}

export async function setSystemConfig(configId: string, data: Record<string, unknown>): Promise<void> {
  await getSystemConfigCollection().doc(configId).set(data, { merge: true });
}

// Discount Code Helpers
export const DISCOUNT_CODES_COLLECTION = "discount_codes";
export const getDiscountCodesCollection = () => firestoreDb.collection(DISCOUNT_CODES_COLLECTION);

export async function getDiscountCode(code: string): Promise<DiscountCode | null> {
  const normalized = code.trim().toUpperCase();
  const doc = await getDiscountCodesCollection().doc(normalized).get();
  if (!doc.exists) return null;
  return doc.data() as DiscountCode;
}

export async function getAllDiscountCodes(): Promise<DiscountCode[]> {
  const snapshot = await getDiscountCodesCollection().get();
  const codes: DiscountCode[] = [];
  snapshot.forEach((doc) => {
    codes.push(doc.data() as DiscountCode);
  });
  // Sort newest first
  return codes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function saveDiscountCode(discount: DiscountCode): Promise<void> {
  const normalized = discount.code.trim().toUpperCase();
  await getDiscountCodesCollection().doc(normalized).set({
    ...discount,
    code: normalized,
    id: normalized,
    updatedAt: Date.now(),
  }, { merge: true });
}

export async function deleteDiscountCode(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  await getDiscountCodesCollection().doc(normalized).delete();
}

export async function recordDiscountUsage(code: string, discountAmountCents: number): Promise<void> {
  const normalized = code.trim().toUpperCase();
  const doc = await getDiscountCodesCollection().doc(normalized).get();
  if (!doc.exists) return;
  const current = doc.data() as DiscountCode;
  await getDiscountCodesCollection().doc(normalized).update({
    usedCount: (current.usedCount || 0) + 1,
    totalDiscountGivenCents: (current.totalDiscountGivenCents || 0) + discountAmountCents,
    updatedAt: Date.now(),
  });
}


