import crypto from "crypto";
import { firestoreDb, getAllDiscountCodes, getOrderById, getOrdersCollection } from "../firebase-admin";
import { effectiveOrderEmail } from "../checkout-contact-policy";
import { getEmailPreference, getSenderKey } from "./preferences";
import { ensureUnsubscribeToken, type FollowupTransport } from "./dispatch";
import { MANUAL_MESSAGES } from "./manual";
import { isSensitiveOccasionOrder } from "./sympathy";
import type { DiscountType, Order } from "../types";
import type { OfferVersionRecord } from "../contracts/admin-overhaul";

export type FollowupOptInState = "opted_in" | "none" | "unsubscribed" | "bounced" | "complained";
export type FollowupItemStatus =
  | "needs_followup"
  | "sent"
  | "uncertain"
  | "skipped"
  | "auto_skipped_sympathy"
  | "suppressed";

export interface PaidFollowupItem {
  orderId: string;
  email: string;
  senderFirstName: string;
  senderName: string;
  recipientFirstName: string;
  occasion: string;
  frontImageUrl: string;
  orderStatus: string;
  createdAt: number;
  mailedAt: number | null;
  amountInCents: number;
  isTestOrder: boolean;
  isSensitiveOccasion: boolean;
  optInState: FollowupOptInState;
  followupStatus: FollowupItemStatus;
  sentAt: number | null;
  skippedAt: number | null;
  skipReason: string | null;
  deliveryOutcome: string | null;
  discountCodeUsed: string | null;
  lastSubject: string | null;
  lastBody: string | null;
}

export interface IncompleteCheckoutItem {
  email: string;
  latestOrderId: string;
  attemptCount: number;
  orderIds: string[];
  latestAttemptAt: number;
  firstAttemptAt: number;
  senderFirstName: string;
  senderName: string;
  occasion: string;
  frontImageUrl: string;
  isTestOrder: boolean;
  isSensitiveOccasion: boolean;
  optInState: FollowupOptInState;
  followupStatus: FollowupItemStatus;
  sentAt: number | null;
  skippedAt: number | null;
  skipReason: string | null;
  deliveryOutcome: string | null;
  discountCodeUsed: string | null;
  lastSubject: string | null;
  lastBody: string | null;
}

export interface ActiveDiscountOption {
  code: string;
  type: DiscountType;
  value: number;
  description: string;
  usedCount: number;
  maxUses: number | null;
  expiresAt: number | null;
}

export interface FollowupInboxReadiness {
  canSendLive: boolean;
  deliveryActive: boolean;
  stagingReviewOnly: boolean;
  hasPostalAddress: boolean;
  senderEmail: string;
  replyTo: string;
  postalAddress: string;
  blockers: string[];
}

export interface FollowupInboxData {
  paidOrders: PaidFollowupItem[];
  incompleteCheckouts: IncompleteCheckoutItem[];
  counts: {
    paidNeedsFollowup: number;
    paidTotal: number;
    paidSympathySkipped: number;
    paidWithoutEmail: number;
    incompleteNeedsFollowup: number;
    incompleteTotal: number;
  };
  activeDiscounts: ActiveDiscountOption[];
  readiness: FollowupInboxReadiness;
}

const SUPPRESSED_STATES = new Set(["unsubscribed", "bounced", "complained"]);
const PAID_STATUSES = new Set([
  "PAYMENT_RECEIVED",
  "QUEUED_FOR_FULFILLMENT",
  "DISPATCHING",
  "DISPATCH_UNCERTAIN",
  "PROCESSING_HANDWRYTTEN",
  "MAILED",
  "AWAITING_RECIPIENT_ADDRESS",
]);
const RECORD_STATE_PRIORITY: Record<string, number> = {
  accepted: 4,
  dispatching: 3,
  uncertain: 3,
  skipped: 2,
  draft: 1,
};
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const emailHash = (email: string) => hash(email.trim().toLowerCase());
const manualDocIdForOrder = (orderId: string) => `manual_${hash(JSON.stringify(["order", orderId]))}`;
const manualRefForOrder = (orderId: string) => firestoreDb.collection(MANUAL_MESSAGES).doc(manualDocIdForOrder(orderId));
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function normalizedOrderEmail(order: Order): string {
  return effectiveOrderEmail(order).trim().toLowerCase();
}

function isRefundedOrder(order: Order): boolean {
  return order.purchaseMeasurement?.refundStatus === "fully_refunded";
}

function isTestOrCompOrder(order: Order): boolean {
  return Boolean(
    order.isTest ||
      order.isFounderTest ||
      order.isComp ||
      order.origin === "ADMIN_COMP" ||
      order.paymentMethod === "STUDIO_COMP" ||
      order.paymentMode === "local_mock" ||
      order.paymentMode === "stripe_test" ||
      (typeof order.amountInCents === "number" && order.amountInCents <= 0)
  );
}

function isPaidOrder(order: Order): boolean {
  if (isRefundedOrder(order)) return false;
  if (order.purchaseMeasurement?.eligible === true) return true;
  return PAID_STATUSES.has(String(order.status || ""));
}

function parseTimestampMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (value && typeof value === "object") {
    const maybe = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === "function") {
      const ms = maybe.toMillis();
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    if (typeof maybe.seconds === "number" && Number.isFinite(maybe.seconds) && maybe.seconds > 0) {
      return maybe.seconds * 1000;
    }
  }
  return 0;
}

function parseOrderCreatedAt(order: Order): number {
  return (
    parseTimestampMs(order.createdAt) ||
    parseTimestampMs(order.purchaseMeasurement?.verifiedAt) ||
    parseTimestampMs(order.updatedAt) ||
    0
  );
}

function parseOrderMailedAt(order: Order): number | null {
  const verified = parseTimestampMs(order.postPurchaseMailedAt);
  if (verified > 0) return verified;
  const handwrytten = parseTimestampMs(order.handwryttenMailedDate);
  if (handwrytten > 0) return handwrytten;
  return null;
}

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/[\r\n]+/g, " ").slice(0, 80) : "";
}

function formatSenderName(order: Order): { first: string; full: string } {
  const first = cleanName(order.returnAddress?.firstName);
  const last = cleanName(order.returnAddress?.lastName);
  return { first, full: [first, last].filter(Boolean).join(" ") };
}

function resolveOptInState(prefState: string | undefined, optedInFromOrders: boolean): FollowupOptInState {
  if (prefState === "unsubscribed" || prefState === "bounced" || prefState === "complained") {
    return prefState;
  }
  if (prefState === "granted") {
    return "opted_in";
  }
  if (prefState !== "denied" && optedInFromOrders) {
    return "opted_in";
  }
  return "none";
}

export function quickFollowupReadiness(): FollowupInboxReadiness {
  const deliveryActive = process.env.MANUAL_FOLLOWUP_DELIVERY_ACTIVE === "true";
  const stagingReviewOnly = process.env.STAGING_REVIEW_ONLY === "true";
  const senderEmail = process.env.POST_PURCHASE_SENDER_EMAIL?.trim() || "zeke@sendmynotes.com";
  const replyTo = process.env.POST_PURCHASE_REPLY_TO?.trim() || senderEmail;
  const postalAddress = process.env.POST_PURCHASE_BUSINESS_POSTAL_ADDRESS?.trim() || "";
  const blockers: string[] = [];

  if (!deliveryActive) blockers.push("Live sending is paused (MANUAL_FOLLOWUP_DELIVERY_ACTIVE is false).");
  if (stagingReviewOnly) blockers.push("Staging is preview-only; email sending is blocked.");
  if ((process.env.POST_PURCHASE_SENDER_HMAC_KEY?.length || 0) < 32) {
    blockers.push("Sender identity secret is not configured.");
  }
  if ((process.env.POST_PURCHASE_UNSUBSCRIBE_SECRET?.length || 0) < 32) {
    blockers.push("Unsubscribe secret is not configured.");
  }

  return {
    canSendLive: blockers.length === 0,
    deliveryActive,
    stagingReviewOnly,
    hasPostalAddress: postalAddress.length > 0,
    senderEmail,
    replyTo,
    postalAddress,
    blockers,
  };
}

interface StoredManualRecord {
  id?: string;
  sourceType?: string;
  sourceId?: string;
  orderId?: string;
  state?: string;
  subject?: string;
  body?: string;
  acceptedAt?: number;
  skippedAt?: number;
  skipReason?: string;
  deliveryOutcome?: string;
  discountCodeUsed?: string;
  updatedAt?: number;
}

function deriveStatus(
  record: StoredManualRecord | undefined,
  optInState: FollowupOptInState,
  isSensitiveOccasion: boolean
): FollowupItemStatus {
  if (record?.state === "accepted") return "sent";
  if (record?.state === "uncertain" || record?.state === "dispatching") return "uncertain";
  if (SUPPRESSED_STATES.has(optInState)) return "suppressed";
  if (record?.state === "skipped") return "skipped";
  if (isSensitiveOccasion) return "auto_skipped_sympathy";
  return "needs_followup";
}

export async function loadFollowupInbox(options: { includeTests?: boolean; limit?: number } = {}): Promise<FollowupInboxData> {
  const includeTests = options.includeTests === true;
  const limit = Math.max(25, Math.min(400, Math.trunc(options.limit || 250)));

  const [ordersSnap, manualSnap, allDiscounts] = await Promise.all([
    getOrdersCollection().orderBy("createdAt", "desc").limit(limit).get(),
    firestoreDb.collection(MANUAL_MESSAGES).limit(500).get(),
    getAllDiscountCodes().catch(() => []),
  ]);

  const manualByOrderId = new Map<string, StoredManualRecord>();
  for (const doc of manualSnap.docs) {
    const data = doc.data() as StoredManualRecord;
    const key = data.orderId || (data.sourceType === "order" ? data.sourceId : undefined);
    if (key) {
      manualByOrderId.set(key, { ...data, id: data.id || doc.id });
    }
  }

  const rawOrders: Order[] = ordersSnap.docs.map((doc) => ({
    ...(doc.data() as Order),
    id: (doc.data() as Order).id || doc.id,
  }));

  const uniqueEmails = new Set<string>();
  for (const order of rawOrders) {
    const email = normalizedOrderEmail(order);
    if (email) uniqueEmails.add(email);
  }

  const prefByEmail = new Map<string, string>();
  await Promise.all(
    Array.from(uniqueEmails).map(async (email) => {
      try {
        const pref = await getEmailPreference(email);
        if (pref?.state) prefByEmail.set(email, pref.state);
      } catch {
        // Missing HMAC key simply means no stored preference can be read yet.
      }
    })
  );

  const paidOrders: PaidFollowupItem[] = [];
  const paidEmailSet = new Set<string>();
  let paidWithoutEmail = 0;

  // First pass: collect paid orders and remember EVERY email with a non-refunded paid order
  // (even comp/100%-off/test paid orders) so buyers never show up as incomplete checkouts.
  for (const order of rawOrders) {
    if (isRefundedOrder(order)) continue;
    if (!isPaidOrder(order)) continue;

    const email = normalizedOrderEmail(order);
    if (email) {
      paidEmailSet.add(email);
    }

    const testOrder = isTestOrCompOrder(order);
    if (!includeTests && testOrder) continue;

    if (!email) {
      paidWithoutEmail++;
      continue;
    }

    const record = manualByOrderId.get(order.id);
    const sensitive = isSensitiveOccasionOrder(order);
    const optInState = resolveOptInState(prefByEmail.get(email), order.postPurchaseConsent?.optedIn === true);
    const followupStatus = deriveStatus(record, optInState, sensitive);
    const sender = formatSenderName(order);

    paidOrders.push({
      orderId: order.id,
      email,
      senderFirstName: sender.first,
      senderName: sender.full,
      recipientFirstName: cleanName(order.recipientAddress?.firstName),
      occasion:
        cleanName(order.occasion) ||
        cleanName(order.recipientOccasion?.occasionTitle) ||
        cleanName(order.recipientOccasion?.occasionType) ||
        "Personal note",
      frontImageUrl: typeof order.frontImageUrl === "string" ? order.frontImageUrl : "",
      orderStatus: String(order.status || "UNKNOWN"),
      createdAt: parseOrderCreatedAt(order),
      mailedAt: parseOrderMailedAt(order),
      amountInCents: Number(order.amountInCents || 0),
      isTestOrder: testOrder,
      isSensitiveOccasion: sensitive,
      optInState,
      followupStatus,
      sentAt: typeof record?.acceptedAt === "number" ? record.acceptedAt : null,
      skippedAt: typeof record?.skippedAt === "number" ? record.skippedAt : null,
      skipReason: typeof record?.skipReason === "string" ? record.skipReason : null,
      deliveryOutcome: typeof record?.deliveryOutcome === "string" ? record.deliveryOutcome : null,
      discountCodeUsed: typeof record?.discountCodeUsed === "string" ? record.discountCodeUsed : null,
      lastSubject: typeof record?.subject === "string" ? record.subject : null,
      lastBody: typeof record?.body === "string" ? record.body : null,
    });
  }

  paidOrders.sort((a, b) => b.createdAt - a.createdAt);

  // Second pass: group incomplete checkouts by unique email (excluding refunded orders and anyone who completed a paid order).
  const incompleteGroups = new Map<string, Order[]>();
  for (const order of rawOrders) {
    if (isRefundedOrder(order)) continue;
    const testOrder = isTestOrCompOrder(order);
    if (!includeTests && testOrder) continue;
    if (isPaidOrder(order)) continue;

    const email = normalizedOrderEmail(order);
    if (!email || paidEmailSet.has(email)) continue;

    const list = incompleteGroups.get(email) || [];
    list.push(order);
    incompleteGroups.set(email, list);
  }

  const incompleteCheckouts: IncompleteCheckoutItem[] = [];
  for (const [email, attempts] of incompleteGroups.entries()) {
    attempts.sort((a, b) => parseOrderCreatedAt(b) - parseOrderCreatedAt(a));
    const latest = attempts[0];
    const validTimestamps = attempts.map(parseOrderCreatedAt).filter((ts) => ts > 0);
    const latestAttemptAt = validTimestamps.length ? Math.max(...validTimestamps) : 0;
    const firstAttemptAt = validTimestamps.length ? Math.min(...validTimestamps) : 0;

    // Pick highest-priority follow-up record across all attempts for this email.
    let bestRecord: StoredManualRecord | undefined;
    let bestPriority = -1;
    for (const attempt of attempts) {
      const rec = manualByOrderId.get(attempt.id);
      if (!rec) continue;
      const priority = RECORD_STATE_PRIORITY[String(rec.state || "")] || 0;
      if (priority > bestPriority) {
        bestRecord = rec;
        bestPriority = priority;
        if (priority === 4) break;
      }
    }

    const sensitive = attempts.some((attempt) => isSensitiveOccasionOrder(attempt));
    const optInState = resolveOptInState(
      prefByEmail.get(email),
      attempts.some((attempt) => attempt.postPurchaseConsent?.optedIn === true)
    );
    const followupStatus = deriveStatus(bestRecord, optInState, sensitive);
    const senderOrder =
      attempts.find((a) => cleanName(a.returnAddress?.firstName) || cleanName(a.returnAddress?.lastName)) || latest;
    const sender = formatSenderName(senderOrder);
    const occasionOrder =
      attempts.find(
        (a) =>
          cleanName(a.occasion) ||
          cleanName(a.recipientOccasion?.occasionTitle) ||
          cleanName(a.recipientOccasion?.occasionType)
      ) || latest;
    const coverOrder =
      attempts.find((a) => typeof a.frontImageUrl === "string" && a.frontImageUrl.trim().length > 0) || latest;

    incompleteCheckouts.push({
      email,
      latestOrderId: latest.id,
      attemptCount: attempts.length,
      orderIds: attempts.map((a) => a.id),
      latestAttemptAt,
      firstAttemptAt,
      senderFirstName: sender.first,
      senderName: sender.full,
      occasion:
        cleanName(occasionOrder.occasion) ||
        cleanName(occasionOrder.recipientOccasion?.occasionTitle) ||
        cleanName(occasionOrder.recipientOccasion?.occasionType) ||
        "Personal note",
      frontImageUrl: typeof coverOrder.frontImageUrl === "string" ? coverOrder.frontImageUrl : "",
      isTestOrder: attempts.every((a) => isTestOrCompOrder(a)),
      isSensitiveOccasion: sensitive,
      optInState,
      followupStatus,
      sentAt: typeof bestRecord?.acceptedAt === "number" ? bestRecord.acceptedAt : null,
      skippedAt: typeof bestRecord?.skippedAt === "number" ? bestRecord.skippedAt : null,
      skipReason: typeof bestRecord?.skipReason === "string" ? bestRecord.skipReason : null,
      deliveryOutcome: typeof bestRecord?.deliveryOutcome === "string" ? bestRecord.deliveryOutcome : null,
      discountCodeUsed: typeof bestRecord?.discountCodeUsed === "string" ? bestRecord.discountCodeUsed : null,
      lastSubject: typeof bestRecord?.subject === "string" ? bestRecord.subject : null,
      lastBody: typeof bestRecord?.body === "string" ? bestRecord.body : null,
    });
  }

  incompleteCheckouts.sort((a, b) => b.latestAttemptAt - a.latestAttemptAt);

  const now = Date.now();
  const activeDiscounts: ActiveDiscountOption[] = allDiscounts
    .filter((d) => {
      if (!d.isActive) return false;
      if (d.expiresAt && d.expiresAt <= now) return false;
      if (d.maxUses != null && d.maxUses > 0 && (d.usedCount || 0) >= d.maxUses) return false;
      return true;
    })
    .map((d) => ({
      code: d.code,
      type: d.type,
      value: d.value,
      description: d.description || "",
      usedCount: d.usedCount || 0,
      maxUses: d.maxUses ?? null,
      expiresAt: d.expiresAt ?? null,
    }));

  return {
    paidOrders,
    incompleteCheckouts,
    counts: {
      paidNeedsFollowup: paidOrders.filter((o) => o.followupStatus === "needs_followup").length,
      paidTotal: paidOrders.length,
      paidSympathySkipped: paidOrders.filter((o) => o.followupStatus === "auto_skipped_sympathy").length,
      paidWithoutEmail,
      incompleteNeedsFollowup: incompleteCheckouts.filter((c) => c.followupStatus === "needs_followup").length,
      incompleteTotal: incompleteCheckouts.length,
    },
    activeDiscounts,
    readiness: quickFollowupReadiness(),
  };
}

export async function skipFollowupOrder(orderId: string, actor: string, reason = "Skipped by founder"): Promise<{ orderId: string; state: "skipped" }> {
  if (!orderId || orderId.length > 160 || orderId.includes("/")) {
    throw new Error("A valid order ID is required.");
  }
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found.");
  const email = normalizedOrderEmail(order);
  const now = Date.now();

  await firestoreDb.runTransaction(async (tx: any) => {
    const ref = manualRefForOrder(orderId);
    const snap = await tx.get(ref);
    const current = snap.exists ? (snap.data() as StoredManualRecord) : null;
    if (current && ["accepted", "dispatching", "uncertain"].includes(String(current.state || ""))) {
      throw new Error("This follow-up was already sent and cannot be skipped.");
    }
    tx.set(
      ref,
      {
        ...(current || {}),
        id: manualDocIdForOrder(orderId),
        sourceType: "order",
        sourceId: orderId,
        orderId,
        state: "skipped",
        skippedAt: now,
        skipReason: reason.trim().slice(0, 120) || "Skipped by founder",
        ...(email ? { destinationHash: emailHash(email) } : {}),
        updatedAt: now,
        updatedBy: actor,
      },
      { merge: true }
    );
  });

  return { orderId, state: "skipped" };
}

export async function unskipFollowupOrder(orderId: string, actor: string): Promise<{ orderId: string; state: "needs_followup" }> {
  if (!orderId || orderId.length > 160 || orderId.includes("/")) {
    throw new Error("A valid order ID is required.");
  }
  await firestoreDb.runTransaction(async (tx: any) => {
    const ref = manualRefForOrder(orderId);
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const current = snap.data() as StoredManualRecord;
    if (current.state !== "skipped") {
      throw new Error("Only skipped follow-ups can be restored.");
    }
    tx.delete(ref);
  });

  // For incomplete checkouts grouped by email, also restore any prior skipped incomplete attempts
  // for the same normalized email so clicking Restore on the latest attempt cleanly unskips the group.
  const order = await getOrderById(orderId);
  if (order && !isPaidOrder(order) && !isRefundedOrder(order)) {
    const email = normalizedOrderEmail(order);
    if (email) {
      const candidateIds = new Set<string>();
      const [byHashSnap, byEmailSnap] = await Promise.all([
        firestoreDb.collection(MANUAL_MESSAGES).where("destinationHash", "==", emailHash(email)).limit(50).get(),
        getOrdersCollection().where("customerEmail", "==", email).limit(50).get(),
      ]);
      for (const doc of byHashSnap.docs) {
        const data = doc.data() as StoredManualRecord;
        if (data.state !== "skipped" || data.sourceType !== "order") continue;
        const candidateId = data.orderId || data.sourceId;
        if (candidateId && candidateId !== orderId) candidateIds.add(candidateId);
      }
      for (const doc of byEmailSnap.docs) {
        const other = doc.data() as Order;
        const candidateId = other.id || doc.id;
        if (candidateId !== orderId && !isPaidOrder(other) && !isRefundedOrder(other)) {
          candidateIds.add(candidateId);
        }
      }
      for (const candidateId of candidateIds) {
        const candidateOrder = await getOrderById(candidateId);
        if (candidateOrder && (isPaidOrder(candidateOrder) || isRefundedOrder(candidateOrder))) continue;
        if (candidateOrder && normalizedOrderEmail(candidateOrder) !== email) continue;
        await firestoreDb.runTransaction(async (tx: any) => {
          const ref = manualRefForOrder(candidateId);
          const snap = await tx.get(ref);
          if (!snap.exists) return;
          const current = snap.data() as StoredManualRecord;
          if (current.state === "skipped") {
            tx.delete(ref);
          }
        });
      }
    }
  }

  void actor;
  return { orderId, state: "needs_followup" };
}

function randomCodeSuffix(length = 4): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export async function mintSingleUseFollowupCode(input: {
  type: DiscountType;
  value: number;
  validDays?: number;
  orderId?: string;
}): Promise<ActiveDiscountOption> {
  if (input.type !== "PERCENTAGE" && input.type !== "FIXED_AMOUNT") {
    throw new Error("Discount type must be FIXED_AMOUNT or PERCENTAGE.");
  }
  const type: DiscountType = input.type;
  const rawValue = Math.trunc(Number(input.value));
  if (type === "FIXED_AMOUNT" && (!Number.isFinite(rawValue) || rawValue < 50 || rawValue > 900)) {
    throw new Error("Fixed discount must be between $0.50 and $9.00.");
  }
  if (type === "PERCENTAGE" && (!Number.isFinite(rawValue) || rawValue < 5 || rawValue > 100)) {
    throw new Error("Percentage discount must be between 5% and 100%.");
  }
  const rawDays = input.validDays === undefined ? 60 : Number(input.validDays);
  const validDays = Number.isFinite(rawDays) ? Math.max(7, Math.min(90, Math.trunc(rawDays))) : 60;
  const now = Date.now();
  const expiresAt = now + validDays * 86_400_000;
  const label = type === "FIXED_AMOUNT" ? `$${(rawValue / 100).toFixed(rawValue % 100 === 0 ? 0 : 2)} off` : `${rawValue}% off`;
  const description = input.orderId
    ? `Personal follow-up thank-you (${label} · order ${input.orderId.slice(0, 14)})`
    : `Personal follow-up thank-you (${label})`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `THANKS${randomCodeSuffix(4)}`;
    const offerId = `offer_${code}`;
    const created = await firestoreDb.runTransaction(async (tx: any) => {
      const codeRef = firestoreDb.collection("discount_codes").doc(code);
      const versionRef = firestoreDb.collection("offer_versions").doc(`${offerId}_v1`);
      const [codeSnap, versionSnap] = await Promise.all([tx.get(codeRef), tx.get(versionRef)]);
      if (codeSnap.exists || versionSnap.exists) return false;

      const offer: OfferVersionRecord = {
        offerId,
        version: 1,
        code,
        purpose: description,
        campaignId: "manual_followup",
        destinationPath: "/new",
        discountType: type,
        discountValue: rawValue,
        startsAt: now,
        endsAt: expiresAt,
        timezone: "America/Chicago",
        status: "active",
        maxUses: 1,
        usedCount: 0,
        reservedCount: 0,
        totalDiscountGivenCents: 0,
        stackingAllowed: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.create(codeRef, {
        id: code,
        code,
        type,
        value: rawValue,
        description,
        isActive: true,
        maxUses: 1,
        usedCount: 0,
        totalDiscountGivenCents: 0,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
      tx.create(versionRef, offer);
      return true;
    });

    if (created) {
      return {
        code,
        type,
        value: rawValue,
        description,
        usedCount: 0,
        maxUses: 1,
        expiresAt,
      };
    }
  }

  throw new Error("Could not generate a unique discount code. Please try again.");
}

export async function sendQuickFollowup(
  input: { orderId: string; subject: string; body: string; discountCode?: string },
  actor: string,
  options: { transport?: FollowupTransport } = {}
): Promise<{ orderId: string; state: "accepted"; acceptedAt: number; resendId: string }> {
  const readiness = quickFollowupReadiness();
  if (!readiness.canSendLive) {
    throw new Error(readiness.blockers.join(" "));
  }
  if (options.transport && process.env.NODE_ENV !== "test") {
    throw new Error("Test transport is unavailable.");
  }

  const orderId = String(input.orderId || "").trim();
  if (!orderId || orderId.length > 160 || orderId.includes("/")) {
    throw new Error("A valid order ID is required.");
  }
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!subject || subject.length > 160 || /[\r\n]/.test(subject)) {
    throw new Error("Use a single-line subject up to 160 characters.");
  }
  if (!body || body.length > 5000) {
    throw new Error("Use a message of 1–5,000 characters.");
  }
  const discountCode = typeof input.discountCode === "string" ? input.discountCode.trim().toUpperCase().slice(0, 40) : "";

  const order = await getOrderById(orderId);
  if (!order) throw new Error("Order not found.");
  const email = normalizedOrderEmail(order);
  if (!email) throw new Error("This order has no usable email address.");

  const senderKey = getSenderKey(email);
  const pref = await getEmailPreference(email);
  if (pref && SUPPRESSED_STATES.has(pref.state)) {
    throw new Error(`This email address is suppressed (${pref.state}) and cannot be contacted.`);
  }

  // Send-time eligibility recheck for incomplete checkouts: prevent sending an abandonment
  // follow-up if the buyer completed a paid order after the inbox snapshot was loaded.
  const isSourceOrderPaid = isPaidOrder(order);
  if (!isSourceOrderPaid) {
    const allOrdersSnap = await getOrdersCollection().get();
    const hasCompletedPaidOrder = allOrdersSnap.docs.some((doc: any) => {
      const candidate = doc.data() as Order;
      return normalizedOrderEmail(candidate) === email && isPaidOrder(candidate);
    });
    if (hasCompletedPaidOrder) {
      throw new Error("This customer has already completed a paid order. Refresh the Follow-ups inbox before sending.");
    }
  }

  let transport = options.transport;
  if (!transport) {
    if (process.env.DISABLE_LIVE_EXTERNAL_EFFECTS === "true") throw new Error("Live email is disabled.");
    const { getResendApiKey, getResendClient } = await import("../email/resend");
    const key = await getResendApiKey();
    if (!key || /^(re_mock|mock_)/i.test(key)) throw new Error("Live email credentials are not configured.");
    const client = await getResendClient();
    if (!client) throw new Error("Email provider is unavailable.");
    transport = {
      async send(payload, idempotencyKey) {
        const result = await client.emails.send(payload as any, { idempotencyKey });
        if (result.error || !result.data?.id) throw new Error("Provider acceptance could not be confirmed.");
        return { id: result.data.id };
      },
    };
  }

  const docId = manualDocIdForOrder(orderId);
  const ref = manualRefForOrder(orderId);
  const token = await ensureUnsubscribeToken(senderKey);
  const site = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://sendmynotes.com");
  if (site.protocol !== "https:" && process.env.NODE_ENV !== "test") {
    throw new Error("A secure public email-link origin is required.");
  }
  const unsubscribeUrl = new URL(`/email/unsubscribe?token=${encodeURIComponent(token)}`, site).toString();
  const oneClickUrl = new URL(`/api/post-purchase/unsubscribe?token=${encodeURIComponent(token)}`, site).toString();

  const footerLines = [
    "Sent personally by Zeke at SendMyNotes.",
    `Stop optional follow-ups: ${unsubscribeUrl}`,
  ];
  if (readiness.postalAddress) {
    footerLines.push(`SendMyNotes · ${readiness.postalAddress}`);
  }
  const footerText = footerLines.join("\n");
  const text = `${body}\n\n${footerText}`;
  const htmlFooter = footerLines
    .map((line) =>
      line.includes(unsubscribeUrl)
        ? `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#57534e">Stop optional follow-ups</a>`
        : escapeHtml(line)
    )
    .join("<br>");

  const payload = {
    from: `Zeke at SendMyNotes <${readiness.senderEmail}>`,
    replyTo: readiness.replyTo,
    to: email,
    subject,
    text,
    html: `<div style="max-width:560px;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:#292524">${escapeHtml(body).replace(/\n/g, "<br>")}<hr style="border:0;border-top:1px solid #e7e5e4;margin:24px 0"><div style="font-size:12px;line-height:1.5;color:#78716c">${htmlFooter}</div></div>`,
    headers: {
      "List-Unsubscribe": `<${oneClickUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [
      { name: "program", value: "manual_followup" },
      { name: "message_id", value: docId },
    ],
  };

  const now = Date.now();
  const orderRef = getOrdersCollection().doc(orderId);
  const claimed = await firestoreDb.runTransaction(async (tx: any) => {
    const fresh = await tx.get(ref);
    const preference = await tx.get(firestoreDb.collection("email_preferences").doc(senderKey));
    const sourceOrderSnap = await tx.get(orderRef);
    const current = fresh.exists ? (fresh.data() as StoredManualRecord) : null;
    const prefState = preference.data()?.state;
    if (!quickFollowupReadiness().canSendLive) {
      throw new Error("Manual email sending was disabled.");
    }
    if (!sourceOrderSnap.exists || normalizedOrderEmail(sourceOrderSnap.data() as Order) !== email) {
      throw new Error("The order email changed. Refresh and review again.");
    }
    if (!isSourceOrderPaid && isPaidOrder(sourceOrderSnap.data() as Order)) {
      throw new Error("This order was just paid. Refresh the Follow-ups inbox before sending.");
    }
    if (prefState && SUPPRESSED_STATES.has(prefState)) {
      throw new Error(`This email address is suppressed (${prefState}) and cannot be contacted.`);
    }
    if (current && ["accepted", "dispatching", "uncertain"].includes(String(current.state || ""))) {
      return false;
    }
    tx.set(ref, {
      id: docId,
      sourceType: "order",
      sourceId: orderId,
      orderId,
      kind: discountCode ? "marketing" : "service",
      subject,
      body,
      ...(discountCode ? { discountCodeUsed: discountCode } : {}),
      revision: (Number((current as any)?.revision) || 0) + 1,
      destinationHash: emailHash(email),
      state: "dispatching",
      senderKey,
      senderEmail: readiness.senderEmail,
      replyTo: readiness.replyTo,
      postalAddress: readiness.postalAddress,
      dispatchAttemptedAt: now,
      sentBy: actor,
      dispatchPayload: payload,
      payloadHash: hash(JSON.stringify(payload)),
      idempotencyKey: docId,
      createdAt: Number((current as any)?.createdAt) || now,
      updatedAt: now,
      updatedBy: actor,
    });
    return true;
  });

  if (!claimed) {
    throw new Error("A follow-up email was already sent or is in progress for this order.");
  }

  try {
    const sent = await transport.send(payload, docId);
    const acceptedAt = Date.now();
    await ref.set(
      { state: "accepted", resendId: sent.id, acceptedAt, updatedAt: acceptedAt },
      { merge: true }
    );
    return { orderId, state: "accepted", acceptedAt, resendId: sent.id };
  } catch {
    await firestoreDb.runTransaction(async (tx: any) => {
      const current = await tx.get(ref);
      if (current.data()?.state !== "accepted") {
        tx.set(ref, { state: "uncertain", updatedAt: Date.now() }, { merge: true });
      }
    });
    throw new Error("The email provider did not confirm delivery. Do not resend until you check status.");
  }
}
