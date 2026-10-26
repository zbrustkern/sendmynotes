import crypto from "crypto";
import { firestoreDb, getOrderById, getOrdersCollection, updateOrderStatus } from "./firebase-admin";
import { Order, MailingAddress } from "./types";
import { getAuthenticatedAdminActor } from "./admin-auth";
import { getSupplierCountry, normalizeCountryCode, validateMailingAddress } from "./mailing-destinations";
import { validatePersonalSender, processAdminCompOrder } from "./order-processor";
import { isReviewOnlyAdminComp, calculateAdminCompQuote, isAdminCompQuoteSnapshotValid, publicAdminCompQuote, ADMIN_COMP_CATALOG_VERSION, ADMIN_COMP_QUOTE_VERSION, resolveAdminCompAssetById } from "./admin-comp-pricing";
import { AdminCompCreateOrderResponse, AdminCompOrderRequest, AdminCompQuoteRecord, AdminCompQuoteSnapshot, AdminCompPaymentRequestRecord, AdminCompPaymentRequestSummary } from "./admin-comp-types";
import { getAdminSessionSigningKey } from "./admin-auth";
import { createCardPaymentIntent } from "./stripe";
import { resolvePaymentMode } from "./payment-mode";

const AUDIT = "admin_comp_audit";
const QUOTES = "admin_comp_quotes";
const IDEMPOTENCY = "admin_comp_idempotency";
const PAYMENT_REQUESTS = "admin_comp_payment_requests";
export const ADMIN_COMP_PAYMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const STRIPE_MINIMUM_USD_CENTS = 50;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const hmac = (value: string) => crypto.createHmac("sha256", getAdminSessionSigningKey()).update(value).digest("base64url");

export function makeAdminCompCapability(requestId: string, orderId: string, expiresAt: number): string {
  const claims = Buffer.from(JSON.stringify({ requestId, orderId, expiresAt })).toString("base64url");
  return `${claims}.${hmac(claims)}`;
}

export function validateAdminCompCapability(token: unknown, record: AdminCompPaymentRequestRecord, now = Date.now()): boolean {
  if (typeof token !== "string" || token.length > 1024 || record.expiresAt <= now) return false;
  const [claims, signature, ...rest] = token.split(".");
  if (!claims || !signature || rest.length) return false;
  const expected = hmac(claims);
  const sig = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (sig.length !== expectedBytes.length || !crypto.timingSafeEqual(sig, expectedBytes)) return false;
  if (sha256(token) !== record.capabilityHash) return false;
  try {
    const parsed = JSON.parse(Buffer.from(claims, "base64url").toString("utf8"));
    return parsed.requestId === record.requestId && parsed.orderId === record.orderId && parsed.expiresAt === record.expiresAt;
  } catch { return false; }
}

function reasonFrom(record: AdminCompQuoteRecord) { return record.reason; }

function createResponse(order: Order, quote: AdminCompQuoteSnapshot, paymentRequest?: AdminCompPaymentRequestSummary, message?: string): AdminCompCreateOrderResponse {
  return {
    orderId: order.id,
    origin: "ADMIN_COMP",
    lifecycleStatus: order.adminCompLifecycle || (order.amountInCents > 0 ? "payment_pending" : "dispatching"),
    quote,
    paymentRequest: paymentRequest || { status: order.adminCompPaymentRequestStatus || (order.amountInCents === 0 ? "not_needed" : "not_needed"), ...(order.adminCompPaymentRequestId ? { requestId: order.adminCompPaymentRequestId } : {}) },
    staging: { held: order.adminCompLifecycle === "review_only_held", ...(message ? { message } : {}) },
  };
}

function normalizeAddress(value: unknown, country: string): MailingAddress {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Complete mailing address is required.");
  const address = value as Record<string, unknown>;
  const result = { ...address, country } as unknown as MailingAddress;
  for (const field of ["firstName", "lastName", "street1", "street2", "city", "state", "zip"]) {
    const fieldValue = (result as unknown as Record<string, unknown>)[field];
    if (fieldValue !== undefined && typeof fieldValue !== "string") throw new Error(`Address ${field} must be text.`);
  }
  return result;
}

function requestDigest(input: AdminCompOrderRequest): string {
  return sha256(JSON.stringify({
    quoteId: input.quoteId, frontImageAssetId: input.frontImageAssetId,
    printedMessage: input.printedMessage || "", handwrittenNote: input.handwrittenNote,
    fontStyleId: input.fontStyleId, recipientAddress: input.recipientAddress,
    returnAddress: input.returnAddress, customerEmail: input.customerEmail || "",
    scheduledSendDate: input.scheduledSendDate || "",
  }));
}

export async function createAdminCompOrder(input: AdminCompOrderRequest, actor: string, trustedRequestDigest?: string): Promise<{ response: AdminCompCreateOrderResponse; duplicate: boolean }> {
  if (!input || typeof input !== "object") throw new Error("Invalid order request.");
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey.trim().length < 12 || input.idempotencyKey.length > 128) throw new Error("A stable idempotency key is required.");
  const idempotencyKey = input.idempotencyKey.trim();
  const digest = trustedRequestDigest || requestDigest(input);
  const idempotencyDocId = sha256(`${actor.toLowerCase()}\n${idempotencyKey}`);
  const idempotencyRef = firestoreDb.collection(IDEMPOTENCY).doc(idempotencyDocId);
  const priorIdempotency = await idempotencyRef.get();
  if (priorIdempotency.exists) {
    const priorRecord = priorIdempotency.data() as { requestHash: string; orderId: string; actor: string };
    if (priorRecord.actor !== actor || priorRecord.requestHash !== digest) throw new Error("Idempotency key was already used with different order content.");
    const priorOrder = await getOrderById(priorRecord.orderId);
    if (!priorOrder?.adminCompQuote || !isAdminCompQuoteSnapshotValid(priorOrder.adminCompQuote)) throw new Error("Idempotent order snapshot is unavailable; contact an administrator.");
    return { response: createResponse(priorOrder, priorOrder.adminCompQuote), duplicate: true };
  }
  const asset = await resolveAdminCompAssetById(input.frontImageAssetId);
  if (!asset) throw new Error("Select a server-approved card cover asset.");
  if (typeof input.handwrittenNote !== "string" || !input.handwrittenNote.trim() || input.handwrittenNote.length > 2000) throw new Error("A handwritten note of 1 to 2000 characters is required.");
  if (typeof input.fontStyleId !== "string" || !input.fontStyleId.trim()) throw new Error("A handwriting style is required.");
  const quoteDoc = await firestoreDb.collection(QUOTES).doc(input.quoteId).get();
  if (!quoteDoc.exists) throw new Error("Quote not found; request a new quote.");
  const quoteRecord = quoteDoc.data() as AdminCompQuoteRecord;
  const quote = publicAdminCompQuote(quoteRecord);
  const now = Date.now();
  if (quoteRecord.issuedToActor !== actor) throw new Error("This quote was issued to a different admin. Request a new quote.");
  if (quote.expiresAt <= now) throw new Error("Quote expired; request a new quote.");
  if (quote.version !== ADMIN_COMP_QUOTE_VERSION || quote.catalogVersion !== ADMIN_COMP_CATALOG_VERSION) throw new Error("Catalog changed; request a fresh quote.");
  if (!isAdminCompQuoteSnapshotValid(quote)) throw new Error("Stored quote is invalid; request a new quote.");
  const currentQuote = calculateAdminCompQuote({
    countryCode: quote.destinationCountryCode,
    mode: quote.mode,
    adjustments: quote.mode === "individual_adjustments" ? quote.lines.map((line) => ({ lineId: line.lineId, waivedCents: line.waivedCents })) : undefined,
  });
  if (JSON.stringify(quote.lines) !== JSON.stringify(currentQuote.lines) || quote.customerPayableCents !== currentQuote.customerPayableCents || quote.grossCents !== currentQuote.grossCents) throw new Error("Quote terms changed; request a fresh quote.");

  const requestedCountry = (input.recipientAddress as MailingAddress | undefined)?.country;
  const recipientCountry = requestedCountry === undefined ? quote.destinationCountryCode : normalizeCountryCode(requestedCountry);
  if (!recipientCountry) throw new Error("A valid recipient country is required.");
  if (recipientCountry !== quote.destinationCountryCode) throw new Error("Recipient country differs from the quoted destination; request a new quote.");
  const recipient = normalizeAddress(input.recipientAddress, recipientCountry);
  if (!recipient.firstName?.trim()) throw new Error("Recipient first name is required.");
  const recipientValidation = validateMailingAddress(recipient);
  if (!recipientValidation.valid) throw new Error(recipientValidation.errors[0] || "Recipient address is incomplete.");
  const returnAddress = normalizeAddress(input.returnAddress, "US");
  if (input.returnAddress?.country !== undefined && normalizeCountryCode(input.returnAddress.country) !== "US") throw new Error("A personal United States return address is required.");
  const senderValidation = validatePersonalSender(returnAddress);
  if (!senderValidation.valid) throw new Error(senderValidation.error || "A complete personal US return address is required.");
  if (input.customerEmail && (typeof input.customerEmail !== "string" || input.customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail))) throw new Error("Customer email is invalid.");
  const supplierCountry = getSupplierCountry(recipientCountry);
  if (!supplierCountry || supplierCountry.suspended) throw new Error("Recipient destination is not supported for fulfillment.");

  const quoteRef = firestoreDb.collection(QUOTES).doc(quote.quoteId);
  const orderId = `order_admin_comp_${crypto.randomBytes(12).toString("hex")}`;
  const viewToken = `tok_${crypto.randomBytes(24).toString("hex")}`;
  const reviewOnly = isReviewOnlyAdminComp();
  const due = quote.customerPayableCents;
  if (due > 0 && due < STRIPE_MINIMUM_USD_CENTS) throw new Error("Positive customer balances below Stripe’s $0.50 minimum cannot be accepted.");
  const order: Order = {
    id: orderId,
    operationId: `admin_comp_${idempotencyDocId.slice(0, 24)}`,
    origin: "ADMIN_COMP",
    adminCompQuoteId: quote.quoteId,
    adminCompQuote: quote,
    adminCompLifecycle: reviewOnly ? "review_only_held" : (due === 0 ? "paid_ready" : "payment_pending"),
    adminCompPaymentRequestStatus: due === 0 ? "not_needed" : (reviewOnly ? "review_only_held" : "not_needed"),
    customerEmail: input.customerEmail || "",
    frontImageUrl: asset.url,
    printedMessage: input.printedMessage || "",
    handwrittenNote: input.handwrittenNote,
    fontStyleId: input.fontStyleId,
    recipientAddress: recipient,
    returnAddress,
    supplierCountryId: supplierCountry.supplierCountryId,
    supplierCountryName: supplierCountry.countryName,
    ...(input.scheduledSendDate ? { scheduledSendDate: input.scheduledSendDate } : {}),
    status: reviewOnly ? (due === 0 ? "PAYMENT_RECEIVED" : "PENDING_PAYMENT") : (due === 0 ? "PAYMENT_RECEIVED" : "PENDING_PAYMENT"),
    ...(reviewOnly ? { fulfillmentStatus: "ADMIN_COMP_REVIEW_HOLD" } : {}),
    amountInCents: due,
    finalAmountInCents: due,
    originalAmountInCents: quote.grossCents,
    discountAmountInCents: quote.waivedCents,
    paymentMethod: due === 0 ? "STUDIO_COMP" : "STRIPE",
    isComp: due === 0,
    viewToken,
    createdAt: now,
    updatedAt: now,
  };
  const idemRecord = { idempotencyKeyHash: idempotencyDocId, requestHash: digest, orderId, actor, createdAt: now };
  let wasDuplicate = false;
  let finalizedOrderId = orderId;
  await firestoreDb.runTransaction(async (tx: any) => {
    const idemSnap = await tx.get(idempotencyRef);
    const storedQuoteSnap = await tx.get(quoteRef);
    if (idemSnap.exists) {
      const existing = idemSnap.data() as { requestHash: string; orderId: string };
      if (existing.requestHash !== digest) throw new Error("Idempotency key was already used with different order content.");
      wasDuplicate = true;
      finalizedOrderId = existing.orderId;
      return;
    }
    if (!storedQuoteSnap.exists) throw new Error("Quote not found; request a new quote.");
    const latestQuote = storedQuoteSnap.data() as AdminCompQuoteRecord;
    if (latestQuote.consumedAt || latestQuote.consumedByOrderId) throw new Error("Quote has already been accepted.");
    if (latestQuote.issuedToActor !== actor || latestQuote.expiresAt <= now) throw new Error("Quote expired or admin binding changed; request a fresh quote.");
    tx.set(getOrdersCollection().doc(orderId), order);
    tx.update(quoteRef, { consumedAt: now, consumedByOrderId: orderId });
    tx.set(idempotencyRef, idemRecord);
    tx.set(firestoreDb.collection(AUDIT).doc(`accepted_${orderId}`), {
      eventId: `accepted_${orderId}`, event: "order_accepted", orderId, quoteId: quote.quoteId,
      actor, reason: reasonFrom(latestQuote), occurredAt: now, requestHash: digest,
      grossCents: quote.grossCents, waivedCents: quote.waivedCents, customerPayableCents: due,
    });
  });
  if (wasDuplicate) {
    const prior = await getOrderById(finalizedOrderId);
    if (!prior) throw new Error("Idempotent order is being finalized; check status and retry.");
    return { response: createResponse(prior, quote), duplicate: true };
  }

  if (reviewOnly) {
    await firestoreDb.collection(AUDIT).doc(`held_${orderId}`).set({ eventId: `held_${orderId}`, event: "held_for_review", orderId, quoteId: quote.quoteId, actor: "system:staging-review", reason: "STAGING_REVIEW_ONLY", occurredAt: Date.now() });
    return { response: createResponse(order, quote, due === 0 ? { status: "not_needed" } : { status: "review_only_held", amountCents: due }, "Staging review only: no payment, email, or supplier request was made."), duplicate: false };
  }

  if (due === 0) {
    const dispatch = await processAdminCompOrder(orderId);
    const updated = await getOrderById(orderId) || order;
    const summary = createResponse(updated, quote, { status: "not_needed" }, dispatch.error);
    return { response: summary, duplicate: false };
  }
  return { response: createResponse(order, quote, { status: "not_needed", amountCents: due }), duplicate: false };
}

function paymentRequestResponse(record: AdminCompPaymentRequestRecord, capabilityUrl?: string): AdminCompPaymentRequestSummary {
  return { status: record.status, requestId: record.requestId, amountCents: record.amountCents, expiresAt: record.expiresAt, ...(capabilityUrl ? { capabilityUrl } : {}) };
}

function trustedBaseUrl(): string {
  const value = (process.env.ADMIN_COMP_PAYMENT_BASE_URL || process.env.NEXT_PUBLIC_APP_URL)?.trim();
  if (!value) throw new Error("Payment request origin is not configured.");
  const url = new URL(value);
  if (!['https:', ...(process.env.NODE_ENV !== "production" ? ["http:"] : [])].includes(url.protocol)) throw new Error("Payment request origin must use HTTPS.");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid payment request origin.");
  const host = url.hostname.toLowerCase();
  const appOwnedHost = host === "sendmynotes.com" || host.endsWith(".sendmynotes.com") || host === "sendmynotes.web.app" || host === "sendmynotes-staging.web.app" || host === "sendmynotes-staging--sendmynotes-staging.us-central1.hosted.app";
  const localHost = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(host);
  if (!appOwnedHost && !localHost) throw new Error("Payment request origin must be an approved SendMyNotes or local app origin.");
  return url.origin;
}

export async function createAdminCompPaymentRequest(orderId: string, actor: string): Promise<AdminCompPaymentRequestSummary> {
  const order = await getOrderById(orderId);
  if (!order || order.origin !== "ADMIN_COMP" || !order.adminCompQuote || !isAdminCompQuoteSnapshotValid(order.adminCompQuote)) throw new Error("Admin complimentary order not found or its quote is invalid.");
  if (order.adminCompQuote.customerPayableCents <= 0 || order.amountInCents !== order.adminCompQuote.customerPayableCents) throw new Error("A payment request is available only for a positive verified balance.");
  if (isReviewOnlyAdminComp()) {
    const summary = { status: "review_only_held" as const, amountCents: order.amountInCents };
    await updateOrderStatus(orderId, { adminCompLifecycle: "review_only_held", adminCompPaymentRequestStatus: "review_only_held", fulfillmentStatus: "ADMIN_COMP_REVIEW_HOLD" } as any);
    await firestoreDb.collection(AUDIT).doc(`payment_hold_${orderId}`).set({ eventId: `payment_hold_${orderId}`, event: "payment_request_held", orderId, quoteId: order.adminCompQuoteId, actor, reason: "STAGING_REVIEW_ONLY", occurredAt: Date.now() });
    return summary;
  }
  if (order.adminCompLifecycle === "review_only_held") return { status: "review_only_held", amountCents: order.amountInCents };
  if (order.amountInCents < STRIPE_MINIMUM_USD_CENTS) throw new Error("Customer balance is below Stripe’s $0.50 minimum payment amount; increase or waive it before creating a request.");
  const priorId = order.adminCompPaymentRequestId;
  if (priorId) {
    const snap = await firestoreDb.collection(PAYMENT_REQUESTS).doc(priorId).get();
    if (snap.exists) {
      const record = snap.data() as AdminCompPaymentRequestRecord;
      const token = makeAdminCompCapability(record.requestId, orderId, record.expiresAt);
      return paymentRequestResponse(record, `${trustedBaseUrl()}/comp-payment/${token}`);
    }
  }
  const requestId = `acpr_${crypto.randomBytes(16).toString("hex")}`;
  const expiresAt = Date.now() + ADMIN_COMP_PAYMENT_TTL_MS;
  const token = makeAdminCompCapability(requestId, orderId, expiresAt);
  const record: AdminCompPaymentRequestRecord = {
    requestId, orderId, quoteId: order.adminCompQuoteId!, capabilityHash: sha256(token), expiresAt,
    status: "payment_pending", amountCents: order.amountInCents, createdBy: actor, createdAt: Date.now(), updatedAt: Date.now(),
  };
  const requestRef = firestoreDb.collection(PAYMENT_REQUESTS).doc(requestId);
  await firestoreDb.runTransaction(async (tx: any) => {
    const currentOrderSnap = await tx.get(getOrdersCollection().doc(orderId));
    if (!currentOrderSnap.exists) throw new Error("Order not found.");
    const latest = currentOrderSnap.data() as Order;
    if (latest.origin !== "ADMIN_COMP" || latest.adminCompQuoteId !== order.adminCompQuoteId || latest.amountInCents !== order.amountInCents || latest.adminCompLifecycle !== "payment_pending") throw new Error("Order state changed; reload and retry.");
    if (latest.adminCompPaymentRequestId) throw new Error("A payment request was concurrently created; check order status.");
    tx.set(requestRef, record);
    tx.update(getOrdersCollection().doc(orderId), { adminCompPaymentRequestId: requestId, adminCompPaymentRequestStatus: "payment_pending", updatedAt: Date.now() });
    tx.set(firestoreDb.collection(AUDIT).doc(`payment_request_${requestId}`), { eventId: `payment_request_${requestId}`, event: "payment_request_created", orderId, quoteId: order.adminCompQuoteId, actor, reason: "Admin created fixed-balance customer payment request.", occurredAt: Date.now(), amountCents: order.amountInCents });
  });
  return paymentRequestResponse(record, `${trustedBaseUrl()}/comp-payment/${token}`);
}

export async function getAdminCompOrderStatus(orderId: string) {
  const order = await getOrderById(orderId);
  if (!order || order.origin !== "ADMIN_COMP" || !order.adminCompQuote) return null;
  const request = order.adminCompPaymentRequestId ? await firestoreDb.collection(PAYMENT_REQUESTS).doc(order.adminCompPaymentRequestId).get() : null;
  const record = request?.exists ? request.data() as AdminCompPaymentRequestRecord : undefined;
  return {
    orderId,
    origin: "ADMIN_COMP" as const,
    lifecycleStatus: order.adminCompLifecycle || "failed",
    paymentStatus: order.adminCompPaymentRequestStatus || "not_needed",
    amountDueCents: order.adminCompQuote.customerPayableCents,
    paymentRequestStatus: record?.status || order.adminCompPaymentRequestStatus || "not_needed",
    quote: publicAdminCompQuote({ ...order.adminCompQuote, issuedToActor: "", reason: "" } as AdminCompQuoteRecord),
  };
}

export async function getCompPaymentPage(token: string): Promise<{ response: import("./admin-comp-types").AdminCompPaymentPageResponse; record: AdminCompPaymentRequestRecord; order: Order } | null> {
  const pieces = token.split(".");
  if (pieces.length !== 2) return null;
  let claims: any;
  try { claims = JSON.parse(Buffer.from(pieces[0], "base64url").toString("utf8")); } catch { return null; }
  if (typeof claims.requestId !== "string" || typeof claims.orderId !== "string" || !Number.isSafeInteger(claims.expiresAt)) return null;
  const snap = await firestoreDb.collection(PAYMENT_REQUESTS).doc(claims.requestId).get();
  if (!snap.exists) return null;
  const record = snap.data() as AdminCompPaymentRequestRecord;
  if (!validateAdminCompCapability(token, record)) return null;
  const order = await getOrderById(record.orderId);
  if (!order || order.origin !== "ADMIN_COMP" || order.adminCompQuoteId !== record.quoteId || !order.adminCompQuote || !isAdminCompQuoteSnapshotValid(order.adminCompQuote)) return null;
  return {
    record,
    order,
    response: {
      orderId: order.id,
      status: order.adminCompPaymentRequestStatus || record.status,
      quote: {
        lines: order.adminCompQuote.lines,
        grossCents: order.adminCompQuote.grossCents,
        waivedCents: order.adminCompQuote.waivedCents,
        customerPayableCents: order.adminCompQuote.customerPayableCents,
        currency: order.adminCompQuote.currency,
      },
      expiresAt: record.expiresAt,
    },
  };
}

export async function createCompPaymentIntent(token: string): Promise<{ clientSecret: string; paymentIntentId: string; amountCents: number; currency: "USD" } | null> {
  const page = await getCompPaymentPage(token);
  if (!page || page.record.status !== "payment_pending" || page.order.adminCompPaymentRequestStatus === "paid") return null;
  if (isReviewOnlyAdminComp() || process.env.STAGING_REVIEW_ONLY === "true") throw new Error("Staging review only: customer payment is disabled.");
  if (page.order.origin !== "ADMIN_COMP" || page.order.adminCompQuoteId !== page.record.quoteId ||
      page.order.amountInCents !== page.record.amountCents || page.order.amountInCents !== page.order.adminCompQuote?.customerPayableCents ||
      page.order.amountInCents < STRIPE_MINIMUM_USD_CENTS) throw new Error("Fixed payment amount no longer matches the accepted order.");
  const mode = resolvePaymentMode();
  if (mode === "live" && process.env.ALLOW_ADMIN_COMP_LIVE_PAYMENT !== "true") throw new Error("Admin-comp live payment is not enabled.");
  if (page.record.paymentIntentId) {
    if (mode === "local_mock") {
      if (page.record.paymentIntentId !== `pi_mock_${page.order.id}` || page.order.stripePaymentId !== page.record.paymentIntentId) throw new Error("Existing local fake PaymentIntent binding is invalid.");
      return { clientSecret: `mock_pi_secret_${page.order.id}`, paymentIntentId: page.record.paymentIntentId, amountCents: page.record.amountCents, currency: "USD" };
    }
    const { getStripeClient } = await import("./stripe");
    const pi = await getStripeClient().paymentIntents.retrieve(page.record.paymentIntentId);
    const quote = page.order.adminCompQuote!;
    if (pi.id !== page.order.stripePaymentId || pi.amount !== page.record.amountCents || pi.currency !== "usd" ||
        pi.metadata.origin !== "ADMIN_COMP" || pi.metadata.orderId !== page.order.id || pi.metadata.adminCompPaymentRequestId !== page.record.requestId ||
        pi.metadata.adminCompQuoteId !== quote.quoteId || pi.metadata.adminCompQuoteVersion !== quote.version ||
        pi.metadata.adminCompDestinationCountryCode !== quote.destinationCountryCode || pi.metadata.adminCompTotalCents !== String(quote.customerPayableCents)) throw new Error("Existing PaymentIntent binding is invalid.");
    if (!pi.client_secret) throw new Error("PaymentIntent client secret is unavailable.");
    return { clientSecret: pi.client_secret, paymentIntentId: pi.id, amountCents: pi.amount, currency: "USD" };
  }
  const created = await createCardPaymentIntent({
    orderId: page.order.id,
    customerEmail: page.order.customerEmail || undefined,
    amountInCents: page.record.amountCents,
    idempotencyKey: `admin-comp-${page.record.requestId}`,
    metadata: {
      origin: "ADMIN_COMP",
      adminCompQuoteId: page.record.quoteId,
      adminCompQuoteVersion: page.order.adminCompQuote!.version,
      adminCompDestinationCountryCode: page.order.adminCompQuote!.destinationCountryCode,
      adminCompTotalCents: String(page.record.amountCents),
      adminCompPaymentRequestId: page.record.requestId,
    },
  });
  if (!created.clientSecret) throw new Error("Payment processor did not return a payment client secret.");
  const reqRef = firestoreDb.collection(PAYMENT_REQUESTS).doc(page.record.requestId);
  await firestoreDb.runTransaction(async (tx: any) => {
    const reqSnap = await tx.get(reqRef);
    const orderRef = getOrdersCollection().doc(page.order.id);
    const orderSnap = await tx.get(orderRef);
    if (!reqSnap.exists || !orderSnap.exists) throw new Error("Payment request disappeared while binding payment.");
    const latestReq = reqSnap.data() as AdminCompPaymentRequestRecord;
    const latestOrder = orderSnap.data() as Order;
    if (latestReq.status !== "payment_pending" || latestReq.expiresAt <= Date.now()) throw new Error("Payment request expired or is no longer payable.");
    if (latestOrder.origin !== "ADMIN_COMP" || latestOrder.adminCompQuoteId !== page.record.quoteId || latestOrder.amountInCents !== page.record.amountCents || latestReq.requestId !== page.record.requestId || latestReq.amountCents !== page.record.amountCents) throw new Error("Payment request changed while binding payment.");
    if (latestReq.paymentIntentId && latestReq.paymentIntentId !== created.paymentIntentId) throw new Error("A different PaymentIntent is already bound.");
    if (latestOrder.stripePaymentId && latestOrder.stripePaymentId !== created.paymentIntentId) throw new Error("A different PaymentIntent is already bound to this order.");
    tx.update(reqRef, { paymentIntentId: created.paymentIntentId, updatedAt: Date.now() });
    tx.update(orderRef, { stripePaymentId: created.paymentIntentId, paymentMode: mode === "local_mock" ? "local_mock" : (mode === "stripe_test" ? "stripe_test" : "live"), updatedAt: Date.now() });
  });
  return { clientSecret: created.clientSecret, paymentIntentId: created.paymentIntentId, amountCents: page.record.amountCents, currency: "USD" };
}

export async function markAdminCompPaymentPaid(orderId: string, paymentIntentId: string) {
  const order = await getOrderById(orderId);
  if (!order?.adminCompPaymentRequestId) return;
  const ref = firestoreDb.collection(PAYMENT_REQUESTS).doc(order.adminCompPaymentRequestId);
  await firestoreDb.runTransaction(async (tx: any) => {
    const req = await tx.get(ref);
    const current = await tx.get(getOrdersCollection().doc(orderId));
    if (!req.exists || !current.exists) throw new Error("Admin comp payment request binding is missing.");
    const record = req.data() as AdminCompPaymentRequestRecord;
    const latest = current.data() as Order;
    if (record.orderId !== orderId || record.quoteId !== latest.adminCompQuoteId || latest.stripePaymentId !== paymentIntentId) throw new Error("Admin comp payment request does not match accepted order.");
    tx.update(ref, { status: "paid", paymentIntentId, updatedAt: Date.now() });
    tx.update(getOrdersCollection().doc(orderId), { adminCompPaymentRequestStatus: "paid", adminCompLifecycle: isReviewOnlyAdminComp() ? "review_only_held" : "paid_ready", updatedAt: Date.now() });
    tx.set(firestoreDb.collection(AUDIT).doc(`paid_${orderId}`), { eventId: `paid_${orderId}`, event: "payment_verified", orderId, quoteId: latest.adminCompQuoteId, actor: "system:stripe-verified", reason: "Exact positive balance verified by Stripe.", occurredAt: Date.now(), paymentIntentId, amountCents: latest.amountInCents });
  });
}

export async function recordAdminCompAudit(event: string, orderId: string, actor: string, reason: string, details?: Record<string, unknown>) {
  const id = `${event}_${orderId}_${Date.now()}`;
  await firestoreDb.collection(AUDIT).doc(id).set({ eventId: id, event, orderId, actor, reason, details, occurredAt: Date.now() });
}

export function isAuthenticatedAdminRequest(req: import("next/server").NextRequest): string | null {
  return getAuthenticatedAdminActor(req);
}

export function requireUsSender(address: MailingAddress): MailingAddress {
  const countryCode = address.country === undefined ? "US" : normalizeCountryCode(address.country);
  if (countryCode !== "US") throw new Error("A personal United States return address is required.");
  return { ...address, country: "US" };
}
