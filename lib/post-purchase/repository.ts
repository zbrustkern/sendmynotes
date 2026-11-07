import { firestoreDb } from "../firebase-admin";
import type { PostPurchaseEnrollment, PostPurchaseMessage } from "./contracts";
export const ENROLLMENTS = "post_purchase_enrollments";
export const MESSAGES = "post_purchase_messages";
export const enrollmentRef = (id: string) => firestoreDb.collection(ENROLLMENTS).doc(id);
export const messageRef = (id: string) => firestoreDb.collection(MESSAGES).doc(id);
export async function getEnrollment(id: string): Promise<PostPurchaseEnrollment | null> { const s = await enrollmentRef(id).get(); return s.exists ? s.data() as PostPurchaseEnrollment : null; }
export async function getMessage(id: string): Promise<PostPurchaseMessage | null> { const s = await messageRef(id).get(); return s.exists ? s.data() as PostPurchaseMessage : null; }
export async function listDueMessages(now = Date.now(), limit = 25): Promise<PostPurchaseMessage[]> {
  const safeLimit = Math.max(1, Math.min(100, limit));
  const [scheduled, expired] = await Promise.all([
    firestoreDb.collection(MESSAGES).where("state", "==", "scheduled").where("dueAt", "<=", now).orderBy("dueAt", "asc").limit(safeLimit).get(),
    firestoreDb.collection(MESSAGES).where("state", "==", "dispatching").where("leaseUntil", "<=", now).orderBy("leaseUntil", "asc").limit(safeLimit).get(),
  ]);
  const byId = new Map<string, PostPurchaseMessage>();
  for (const d of [...scheduled.docs, ...expired.docs]) byId.set(d.id, d.data() as PostPurchaseMessage);
  return [...byId.values()].sort((a, b) => a.dueAt - b.dueAt).slice(0, safeLimit);
}
