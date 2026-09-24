import * as admin from "firebase-admin";
import { Order, ImageCachePoolItem } from "./types";

// In-memory mock store for offline testing or when GCP credentials are not present
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
  }
  async update(data: Partial<T>): Promise<void> {
    const existing = this._collection.store.get(this._id);
    if (!existing) {
      throw new Error(`Document ${this._id} does not exist.`);
    }
    this._collection.store.set(this._id, { ...existing, ...data });
  }
  async delete(): Promise<void> {
    this._collection.store.delete(this._id);
  }
}

class MockCollection<T = Record<string, unknown>> {
  public store = new Map<string, T>();

  doc(id?: string): MockDocRef<T> {
    const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return new MockDocRef<T>(this, docId);
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

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockCollection());
    }
    return this.collections.get(name)!;
  }
}

const mockFirestoreInstance = new MockFirestore();

// Singleton check for Real vs Mock Firebase Admin
function initializeFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (admin.apps.length > 0) {
    return { db: admin.firestore(), isMock: false };
  }

  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log("[Firebase Admin] Connected to live Cloud Firestore:", projectId);
      return { db: admin.firestore(), isMock: false };
    } catch (err) {
      console.warn("[Firebase Admin] Error initializing live SDK, falling back to mock:", err);
    }
  }

  console.log("[Firebase Admin] Using in-memory mock Firestore store (development/test mode).");
  return { db: mockFirestoreInstance as unknown as admin.firestore.Firestore, isMock: true };
}

const { db: firestoreDb, isMock: isFirestoreMock } = initializeFirebase();

export { firestoreDb, isFirestoreMock };

// Collection Helpers
export const ORDERS_COLLECTION = "orders";
export const IMAGE_CACHE_POOL_COLLECTION = "image_cache_pool";
export const SYSTEM_INCIDENTS_COLLECTION = "system_incidents";

export const getOrdersCollection = () => firestoreDb.collection(ORDERS_COLLECTION);
export const getImageCachePoolCollection = () => firestoreDb.collection(IMAGE_CACHE_POOL_COLLECTION);
export const getSystemIncidentsCollection = () => firestoreDb.collection(SYSTEM_INCIDENTS_COLLECTION);

export async function saveOrder(order: Order): Promise<void> {
  await getOrdersCollection().doc(order.id).set(order);
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
  await getOrdersCollection().doc(orderId).update({
    ...update,
    updatedAt: Date.now(),
  });
}

export async function saveImageCacheItem(item: ImageCachePoolItem): Promise<void> {
  await getImageCachePoolCollection().doc(item.id).set(item);
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

