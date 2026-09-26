import crypto from "crypto";
import { firestoreDb, sanitizeFirestoreData } from "./firebase-admin";
import { OccasionReminder, OccasionType, MailingAddress } from "./types";
import { calculateDaysUntilNextOccasion } from "./reminder-utils";

export * from "./reminder-utils";

export const REMINDERS_COLLECTION = "occasion_reminders";

/**
 * Saves or updates an occasion reminder document in Firestore.
 */
export async function saveOccasionReminder(
  data: Omit<OccasionReminder, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<OccasionReminder> {
  const col = firestoreDb.collection(REMINDERS_COLLECTION);
  const id = data.id || `rem_${crypto.randomBytes(12).toString("hex")}`;
  const now = Date.now();

  const record: OccasionReminder = {
    id,
    recipientName: data.recipientName.trim(),
    ...(data.recipientAddress ? { recipientAddress: data.recipientAddress } : {}),
    ...(data.recipientId ? { recipientId: data.recipientId } : {}),
    userEmail: data.userEmail.trim().toLowerCase(),
    ...(data.userId ? { userId: data.userId } : {}),
    occasionType: data.occasionType || "birthday",
    occasionTitle: data.occasionTitle.trim(),
    month: Math.max(1, Math.min(12, data.month)),
    day: Math.max(1, Math.min(31, data.day)),
    ...(data.year ? { year: data.year } : {}),
    remindDaysBefore: data.remindDaysBefore || 14,
    optIn: data.optIn !== false,
    ...(data.notes ? { notes: data.notes } : {}),
    ...(data.orderId ? { orderId: data.orderId } : {}),
    createdAt: now,
    updatedAt: now,
  };

  const sanitized = sanitizeFirestoreData(record);
  await col.doc(id).set(sanitized, { merge: true });

  return record;
}

/**
 * Fetches reminders for a given user ID or email address.
 */
export async function getRemindersForUser(params: {
  userId?: string;
  email?: string;
}): Promise<OccasionReminder[]> {
  const col = firestoreDb.collection(REMINDERS_COLLECTION);
  const remindersMap = new Map<string, OccasionReminder>();

  if (params.userId) {
    const snap = await col.where("userId", "==", params.userId).get();
    snap.forEach((doc) => {
      remindersMap.set(doc.id, doc.data() as OccasionReminder);
    });
  }

  if (params.email) {
    const cleanEmail = params.email.trim().toLowerCase();
    const snap = await col.where("userEmail", "==", cleanEmail).get();
    snap.forEach((doc) => {
      remindersMap.set(doc.id, doc.data() as OccasionReminder);
    });
  }

  return Array.from(remindersMap.values()).sort((a, b) => {
    const daysA = calculateDaysUntilNextOccasion(a.month, a.day);
    const daysB = calculateDaysUntilNextOccasion(b.month, b.day);
    return daysA - daysB;
  });
}

/**
 * Deletes a reminder by ID.
 */
export async function deleteReminder(reminderId: string): Promise<boolean> {
  try {
    await firestoreDb.collection(REMINDERS_COLLECTION).doc(reminderId).delete();
    return true;
  } catch (err) {
    console.error("[Reminders] Error deleting reminder:", err);
    return false;
  }
}

/**
 * Queries reminders that are coming up within the lead time (default 14 days).
 */
export async function getUpcomingReminders(daysAhead: number = 14): Promise<{
  reminder: OccasionReminder;
  daysRemaining: number;
}[]> {
  const snap = await firestoreDb.collection(REMINDERS_COLLECTION).where("optIn", "==", true).get();
  const upcoming: { reminder: OccasionReminder; daysRemaining: number }[] = [];

  snap.forEach((doc) => {
    const r = doc.data() as OccasionReminder;
    const daysUntil = calculateDaysUntilNextOccasion(r.month, r.day);
    const triggerThreshold = r.remindDaysBefore || 14;

    if (daysUntil <= triggerThreshold && daysUntil >= 0) {
      upcoming.push({ reminder: r, daysRemaining: daysUntil });
    }
  });

  return upcoming.sort((a, b) => a.daysRemaining - b.daysRemaining);
}
