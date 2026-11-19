import crypto from "crypto";
import { firestoreDb } from "../firebase-admin";

export type CheckoutGroup = { ownerKey: string; currentOrderId?: string; currentRevision?: string; lastRetiredOrderId?: string; state: "creating" | "active" | "replacing" | "blocked" | "transferring" | "transferred"; leaseId?: string; updatedAt: number;
  weddingTransfer?: { inputHash: string; leaseUntil: number; projectId?: string; actorId?: string; sessionId?: string; copiedCount?: number; greetingReviewIds?: string[] };
};
const groupId = (checkoutId: string) => crypto.createHash("sha256").update(checkoutId).digest("hex");
/** Transfer and v1 checkout must transact on the same owner/lease document. */
export const multiSendCheckoutRef = (checkoutId: string) => firestoreDb.collection("multi_send_checkout_groups").doc(groupId(checkoutId));

/** Read-only authorization for migrating the old /api/checkout-scoped cookie.
 * A status token alone cannot authorize canceling or transferring an order. */
export async function verifyMultiSendTransferProof(checkoutId:string,ownerKey:string,proof:{orderId:string;viewToken:string}):Promise<boolean> {
  return firestoreDb.runTransaction(async (tx:any)=>{
    const group=(await tx.get(multiSendCheckoutRef(checkoutId))).data() as CheckoutGroup|undefined;
    if(!group||group.ownerKey!==ownerKey||group.currentOrderId!==proof.orderId)return false;
    const order=(await tx.get(firestoreDb.collection('orders').doc(proof.orderId))).data();
    return Boolean(order?.viewToken&&order.viewToken===proof.viewToken&&order.multiSend?.kind==='parent'&&order.multiSend.checkoutId===checkoutId);
  });
}

export function multiSendCheckoutOwnerKey(input: { checkoutId: string; userId?: string; guestCapability?: string }): string {
  const owner = input.userId ? `user:${input.userId}` : input.guestCapability ? `guest-capability:${input.guestCapability}` : "";
  return owner ? crypto.createHash("sha256").update(owner).digest("hex") : "";
}

export async function claimMultiSendCheckout(input: {
  checkoutId: string; contentRevision: string; orderId: string; ownerKey: string;
  replaces?: { orderId?: string; viewToken?: string };
}): Promise<{ claimed: boolean; code?: string; previousOrderId?: string; leaseId?: string }> {
  const ref = firestoreDb.collection("multi_send_checkout_groups").doc(groupId(input.checkoutId));
  const leaseId = crypto.randomUUID();
  return firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const group = snap.exists ? snap.data() as CheckoutGroup : undefined;
    if (group && group.ownerKey !== input.ownerKey) return { claimed: false, code: "MULTI_SEND_OWNER_MISMATCH" };
    if (group?.state === "transferring" || group?.state === "transferred") return { claimed: false, code: "MULTI_SEND_TRANSFERRED" };
    if (group?.state === "creating" || group?.state === "replacing" || group?.state === "blocked") return { claimed: false, code: "MULTI_SEND_CHECKOUT_BUSY" };
    if (group?.currentRevision === input.contentRevision) return { claimed: false, code: "MULTI_SEND_CHECKOUT_RECOVERY_REQUIRED" };
    let previousOrderId: string | undefined;
    if (group?.currentOrderId) {
      previousOrderId = group.currentOrderId;
      const previousRef = firestoreDb.collection("orders").doc(previousOrderId);
      const previousSnap = await tx.get(previousRef);
      const previous = previousSnap.exists ? previousSnap.data() as any : null;
      if (!previous || previous.status !== "PENDING_PAYMENT" || input.replaces?.orderId !== previousOrderId || input.replaces?.viewToken !== previous.viewToken) return { claimed: false, code: "MULTI_SEND_REPLACEMENT_PROOF_REQUIRED" };
    }
    tx.set(ref, { ownerKey: input.ownerKey, ...(group?.lastRetiredOrderId ? { lastRetiredOrderId: group.lastRetiredOrderId } : {}), currentOrderId: input.orderId, currentRevision: input.contentRevision, state: previousOrderId ? "replacing" : "creating", leaseId, updatedAt: Date.now() });
    return { claimed: true, previousOrderId, leaseId };
  });
}

export async function finishMultiSendCheckout(checkoutId: string, leaseId: string): Promise<void> {
  const ref = firestoreDb.collection("multi_send_checkout_groups").doc(groupId(checkoutId));
  await firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const group = snap.exists ? snap.data() as CheckoutGroup : undefined;
    if (!group || group.leaseId !== leaseId || !["creating", "replacing"].includes(group.state)) throw new Error("Multi-send checkout claim was lost.");
    tx.update(ref, { state: "active", leaseId: null, updatedAt: Date.now() });
  });
}

export async function blockMultiSendCheckout(checkoutId: string, leaseId: string): Promise<void> {
  const ref = firestoreDb.collection("multi_send_checkout_groups").doc(groupId(checkoutId));
  await firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const group = snap.exists ? snap.data() as CheckoutGroup : undefined;
    if (group?.leaseId === leaseId) tx.update(ref, { state: "blocked", updatedAt: Date.now() });
  });
}

export async function abortMultiSendCheckoutClaim(input: { checkoutId: string; leaseId: string; previousOrderId?: string }): Promise<void> {
  const ref = firestoreDb.collection("multi_send_checkout_groups").doc(groupId(input.checkoutId));
  await firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const group = snap.exists ? snap.data() as CheckoutGroup : undefined;
    if (!group || group.leaseId !== input.leaseId || !["creating", "replacing"].includes(group.state)) return;
    if (!input.previousOrderId) {
      tx.delete(ref);
      return;
    }
    const priorSnap = await tx.get(firestoreDb.collection("orders").doc(input.previousOrderId));
    const prior = priorSnap.exists ? priorSnap.data() as any : null;
    if (!prior || prior.status !== "PENDING_PAYMENT") {
      tx.update(ref, { state: "blocked", updatedAt: Date.now() });
      return;
    }
    tx.update(ref, { currentOrderId: input.previousOrderId, currentRevision: prior.multiSend?.contentRevision, state: "active", leaseId: null, updatedAt: Date.now() });
  });
}

export async function resetMultiSendCheckoutAfterCanceledReplacement(checkoutId: string, leaseId: string, retiredOrderId?: string): Promise<void> {
  const ref = firestoreDb.collection("multi_send_checkout_groups").doc(groupId(checkoutId));
  await firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const group = snap.exists ? snap.data() as CheckoutGroup : undefined;
    if (!group || group.leaseId !== leaseId || !["replacing", "creating"].includes(group.state)) throw new Error("Multi-send replacement claim was lost.");
    tx.update(ref, { currentOrderId: null, currentRevision: null, ...(retiredOrderId ? { lastRetiredOrderId: retiredOrderId } : {}), state: "active", leaseId: null, updatedAt: Date.now() });
  });
}

export async function verifyMultiSendCheckoutOwner(checkoutId: string, ownerKey: string, orderId: string): Promise<boolean> {
  const ref = firestoreDb.collection("multi_send_checkout_groups").doc(groupId(checkoutId));
  const snap = await ref.get();
  const group = snap.exists ? snap.data() as CheckoutGroup : undefined;
  return Boolean(group && group.ownerKey === ownerKey && group.currentOrderId === orderId && (group.state === "creating" || group.state === "active"));
}

export async function claimMultiSendRetry(checkoutId: string, ownerKey: string, orderId: string): Promise<string | null> {
  const ref = firestoreDb.collection("multi_send_checkout_groups").doc(groupId(checkoutId));
  const leaseId = crypto.randomUUID();
  return firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const group = snap.exists ? snap.data() as CheckoutGroup : undefined;
    if (!group || group.ownerKey !== ownerKey || group.currentOrderId !== orderId || group.state !== "active") return null;
    tx.update(ref, { state: "creating", leaseId, updatedAt: Date.now() });
    return leaseId;
  });
}

export async function recoverMultiSendCheckout(checkoutId: string, ownerKey: string, orderId: string): Promise<void> {
  const ref = firestoreDb.collection("multi_send_checkout_groups").doc(groupId(checkoutId));
  await firestoreDb.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const group = snap.exists ? snap.data() as CheckoutGroup : undefined;
    if (!group || group.ownerKey !== ownerKey || group.currentOrderId !== orderId || !["creating", "active"].includes(group.state)) throw new Error("Multi-send checkout recovery is not authorized.");
    tx.update(ref, { state: "active", leaseId: null, updatedAt: Date.now() });
  });
}
