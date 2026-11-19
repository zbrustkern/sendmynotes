import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { installSafeTestHarness, uninstallSafeTestHarness, getBlockedExternalCalls } from "../lib/testing/safe-harness";
import {
  constantTimeStringEqual,
  createOrderReadToken,
  createOrderReturnTicket,
  ORDER_RETURN_TICKET_TTL_MS,
  verifyOrderReadToken,
  verifyOrderReturnTicket,
} from "../lib/order-access-credentials";

const tempData = fs.mkdtempSync(path.join(os.tmpdir(), "smn-order-access-"));
Object.assign(process.env, { NODE_ENV: "test", USE_MOCK_FIRESTORE: "true", SMN_TEST_DATA_DIR: tempData });
installSafeTestHarness();

const viewToken = `tok_${"0123456789abcdef".repeat(2)}`;
const order = {
  id: "order_access_primary",
  viewToken,
  status: "PROCESSING_HANDWRYTTEN",
  origin: "CUSTOMER_CHECKOUT",
  createdAt: 100,
  updatedAt: 200,
  frontImageUrl: "/presets/thank-you.jpg",
  printedMessage: "Dear Sam,",
  handwrittenNote: "A private synthetic note.",
  fontStyleId: "1",
  recipientAddress: { firstName: "Sam", lastName: "Example", street1: "123 Fictional St", street2: "Unit 4", city: "Sampletown", state: "IL", zip: "60601", country: "US", leakedExtra: "ADDRESS_SECRET" },
  returnAddress: { firstName: "Alex", lastName: "Sender", street1: "456 Example Ave", city: "Sampletown", state: "IL", zip: "60602", country: "US" },
  customerEmail: "sender@example.test",
  contactEmailChoice: "provided",
  receiptEmailSentAt: 300,
  fulfillmentStatus: "QUEUED_FOR_FULFILLMENT",
  addressDeferred: false,
  handwryttenOrderId: "hw_customer_visible_test",
  handwryttenTrackingNumber: "TRACKING_TEST",
  handwryttenTrackingUrl: "https://tracking.example.test/test",
  scheduledSendDate: "2026-12-01",
  amountInCents: 900,
  finalAmountInCents: 900,
  quote: { version: "private quote", countryCode: "US", totalCents: 900, basePriceCents: 900, discountCents: 0, internationalSurchargeCents: 0, currency: "USD" },
  isInternationalPreview: false,
  occasion: "Thank You",
  stripePaymentId: "pi_never_return_this",
  clientSecret: "seti_never_return_this",
  userId: "owner_uid",
  attribution: { googleClientId: "analytics_identity_secret", clientIp: "127.0.0.1" },
  purchaseMeasurement: { transactionId: "analytics_transaction_secret", amountInCents: 900 },
  uploadMaster: { uid: "owner_uid", masterKey: "private/master/key", masterSha256: "secret" },
  adminCompQuote: { id: "admin_quote_secret" },
  adminCompQuoteId: "admin_quote_id_secret",
} as any;

const request = (url: string, headers: Record<string, string> = {}) => new NextRequest(url, { headers });

async function main() {
  const { getOrdersCollection } = await import("../lib/firebase-admin");
  await getOrdersCollection().doc(order.id).set(order);
  await getOrdersCollection().doc("order_access_other").set({ ...order, id: "order_access_other", viewToken: `tok_${"fedcba9876543210".repeat(2)}` });

  const sameReadToken = createOrderReadToken(order.id, viewToken)!;
  const otherReadToken = createOrderReadToken("order_access_other", viewToken)!;
  assert.equal(createOrderReadToken(order.id, viewToken), sameReadToken, "read token derivation is stable for a legacy order");
  assert.notEqual(sameReadToken, otherReadToken, "read token includes the order identity");
  assert.equal(verifyOrderReadToken(order.id, viewToken, sameReadToken), true);
  assert.equal(verifyOrderReadToken("order_access_other", viewToken, sameReadToken), false, "read token cannot cross orders");
  assert.equal(verifyOrderReadToken(order.id, "wrong-view-token", sameReadToken), false);
  assert.equal(verifyOrderReadToken(order.id, viewToken, `${sameReadToken}x`), false);
  assert.equal(constantTimeStringEqual("short", "a different length"), false, "unequal length comparisons fail safely");

  const issuedAt = 1_800_000_000_000;
  const returnTicket = createOrderReturnTicket(order.id, viewToken, issuedAt)!;
  assert.equal(verifyOrderReturnTicket(order.id, viewToken, returnTicket, issuedAt), true);
  assert.equal(verifyOrderReturnTicket(order.id, viewToken, returnTicket, issuedAt + ORDER_RETURN_TICKET_TTL_MS - 1), true);
  assert.equal(verifyOrderReturnTicket(order.id, viewToken, returnTicket, issuedAt + ORDER_RETURN_TICKET_TTL_MS), false, "return ticket expires at its timestamp");
  assert.equal(verifyOrderReturnTicket("order_access_other", viewToken, returnTicket, issuedAt), false, "return ticket cannot cross orders");
  assert.equal(verifyOrderReturnTicket(order.id, viewToken, `${returnTicket}x`, issuedAt), false);
  const tooLongTicket = createOrderReturnTicket(order.id, viewToken, issuedAt - ORDER_RETURN_TICKET_TTL_MS)!;
  assert.equal(verifyOrderReturnTicket(order.id, viewToken, tooLongTicket, issuedAt), false, "future tickets cannot extend the short TTL");

  const { GET, POST } = await import("../app/api/orders/[id]/route");
  const { GET: exchange } = await import("../app/api/orders/[id]/access/route");
  const fixtureAdmin = "admin@example.test";
  process.env.ADMIN_AUTHORIZED_EMAILS = fixtureAdmin;
  const { generateAdminSessionToken, ADMIN_COOKIE_NAME } = await import("../lib/admin-auth");
  const params = { params: Promise.resolve({ id: order.id }) };
  const endpoint = `http://localhost:3000/api/orders/${order.id}`;
  const accessEndpoint = `${endpoint}/access`;

  const missingExchange = await exchange(request(accessEndpoint), params);
  assert.equal(missingExchange.status, 403, "access exchange requires the checkout token header");
  assert.match(missingExchange.headers.get("cache-control") || "", /private, no-store/);
  const adminCannotExchange = await exchange(request(accessEndpoint, {
    cookie: `${ADMIN_COOKIE_NAME}=${generateAdminSessionToken(fixtureAdmin)}`,
  }), params);
  assert.equal(adminCannotExchange.status, 403, "admin cookies are not exchange authority");
  const wrongExchange = await exchange(request(accessEndpoint, { "x-view-token": "wrong" }), params);
  assert.equal(wrongExchange.status, 403);
  const queryExchange = await exchange(request(`${accessEndpoint}?token=${encodeURIComponent(viewToken)}`), params);
  assert.equal(queryExchange.status, 403, "access exchange does not accept checkout tokens in the URL");
  const accountCannotExchange = await exchange(request(accessEndpoint, { authorization: "Bearer mock_token_owner_uid" }), params);
  assert.equal(accountCannotExchange.status, 403, "account authorization is not exchange authority");
  const successfulExchange = await exchange(request(accessEndpoint, { "x-view-token": viewToken }), params);
  assert.equal(successfulExchange.status, 200);
  assert.match(successfulExchange.headers.get("cache-control") || "", /private, no-store/);
  const exchanged = await successfulExchange.json();
  assert.deepEqual(Object.keys(exchanged).sort(), ["readToken", "returnTicket"]);
  assert.equal(exchanged.readToken, sameReadToken);
  assert.equal(verifyOrderReturnTicket(order.id, viewToken, exchanged.returnTicket), true);
  assert.equal(JSON.stringify(exchanged).includes(viewToken), false, "exchange response omits the full checkout credential");

  const scoped = await GET(request(endpoint, { "x-order-read-token": sameReadToken }), params);
  assert.equal(scoped.status, 200);
  assert.match(scoped.headers.get("cache-control") || "", /private, no-store/);
  const scopedBody = await scoped.json();
  assert.deepEqual(Object.keys(scopedBody).sort(), ["accessKind", "order", "readToken"]);
  assert.equal(scopedBody.accessKind, "read");
  assert.equal(scopedBody.readToken, sameReadToken);
  assert.deepEqual(Object.keys(scopedBody.order).sort(), [
    "addressDeferred", "amountInCents", "contactEmailChoice", "createdAt", "customerEmail",
    "destinationCountryCode", "finalAmountInCents", "fontStyleId", "fulfillmentStatus", "frontImageUrl",
    "handwrittenNote", "handwryttenOrderId", "handwryttenTrackingNumber",
    "handwryttenTrackingUrl", "id", "isInternationalPreview", "isRedacted", "occasion", "origin",
    "printedMessage", "receiptEmailSentAt", "recipientAddress", "returnAddress", "scheduledSendDate",
    "status", "totalCents", "updatedAt",
  ].sort());
  assert.equal(scopedBody.order.handwrittenNote, "A private synthetic note.");
  assert.equal(scopedBody.order.recipientAddress.leakedExtra, undefined, "nested address data is also allowlisted");
  assert.equal(scopedBody.order.totalCents, 900, "only the customer-facing total is projected from the stored quote");
  assert.equal(scopedBody.order.quote, undefined);
  assert.equal(scopedBody.order.viewToken, undefined);
  assert.equal(scopedBody.order.stripePaymentId, undefined);
  assert.equal(scopedBody.order.clientSecret, undefined);
  assert.equal(scopedBody.order.attribution, undefined);
  assert.equal(scopedBody.order.purchaseMeasurement, undefined);
  assert.equal(scopedBody.order.uploadMaster, undefined);
  assert.equal(scopedBody.order.adminCompQuote, undefined);
  assert.equal(scopedBody.order.userId, undefined);
  assert.equal(JSON.stringify(scopedBody).includes(viewToken), false);

  const scopedByTicket = await GET(request(endpoint, { "x-order-return-ticket": exchanged.returnTicket }), params);
  assert.equal(scopedByTicket.status, 200);
  const repeatedTicketRead = await GET(request(endpoint, { "x-order-return-ticket": exchanged.returnTicket }), params);
  assert.deepEqual(await repeatedTicketRead.json(), await scopedByTicket.json(), "return-ticket reads are idempotent and read-only");

  const expiredTicket = createOrderReturnTicket(order.id, viewToken, Date.now() - ORDER_RETURN_TICKET_TTL_MS - 1000)!;
  const failClosedRequests = [
    request(endpoint, { "x-order-read-token": "malformed" }),
    request(endpoint, { "x-order-read-token": otherReadToken }),
    request(endpoint, { "x-order-return-ticket": expiredTicket }),
    request(endpoint, { "x-order-return-ticket": createOrderReturnTicket("order_access_other", viewToken)! }),
  ];
  for (const failClosed of failClosedRequests) {
    const response = await GET(failClosed, params);
    const body = await response.json();
    assert.equal(body.order.isRedacted, true, "invalid scoped credentials fall back to public status only");
    assert.equal(body.order.handwrittenNote, undefined);
    assert.equal(body.readToken, undefined);
  }

  const admin = generateAdminSessionToken(fixtureAdmin);
  const invalidReadCannotUseAdmin = await GET(request(`${endpoint}?token=${encodeURIComponent(viewToken)}`, {
    "x-order-read-token": "malformed",
    cookie: `${ADMIN_COOKIE_NAME}=${admin}`,
  }), params);
  assert.equal((await invalidReadCannotUseAdmin.json()).order.isRedacted, true, "a supplied read token has least-privilege priority over admin and checkout credentials");
  const validReadWithAdmin = await GET(request(`${endpoint}?token=${encodeURIComponent(viewToken)}`, {
    "x-order-read-token": sameReadToken,
    cookie: `${ADMIN_COOKIE_NAME}=${admin}`,
  }), params);
  const validReadWithAdminBody = await validReadWithAdmin.json();
  assert.equal(validReadWithAdminBody.accessKind, "read");
  assert.equal(validReadWithAdminBody.order.quote, undefined, "admin authority does not widen a supplied read capability");
  assert.equal(validReadWithAdminBody.order.stripePaymentId, undefined);

  const ownerRead = await GET(request(endpoint, { authorization: "Bearer mock_token_owner_uid" }), params);
  const ownerBody = await ownerRead.json();
  assert.equal(ownerBody.accessKind, "owner", "an eligible signed-in sender can open their own order");
  assert.equal(ownerBody.readToken, sameReadToken);
  assert.equal(ownerBody.order.purchaseMeasurement, undefined);
  assert.equal(ownerBody.order.attribution, undefined);
  const foreignSameEmail = await GET(request(endpoint, { authorization: "Bearer mock_token_sender@example.test" }), params);
  assert.equal((await foreignSameEmail.json()).order.isRedacted, true, "a matching verified email cannot override an explicit order owner UID");

  const batchId = "order_access_batch";
  const batchToken = `tok_${"0011223344556677".repeat(2)}`;
  await getOrdersCollection().doc(batchId).set({
    ...order,
    id: batchId,
    viewToken: batchToken,
    multiSend: {
      kind: "parent",
      recipients: [{
        id: "recipient_synthetic",
        address: { firstName: "Taylor", lastName: "Example", street1: "7 Fictional Place", city: "Sampletown", state: "IL", zip: "60603", country: "US", privateExtra: "NESTED_SECRET" },
        resolvedGreeting: "Dear Taylor,",
        printedMessage: "A shared synthetic note.",
        amountInCents: 900,
        privateExtra: "BATCH_SECRET",
      }],
      quote: { totalCents: 900, paymentSecret: "BATCH_PAYMENT_SECRET" },
    },
  });
  const batchRead = await GET(request(`http://localhost:3000/api/orders/${batchId}`, {
    "x-order-read-token": createOrderReadToken(batchId, batchToken)!,
  }), { params: Promise.resolve({ id: batchId }) });
  const batchBody = await batchRead.json();
  assert.equal(batchRead.status, 200);
  assert.equal(batchBody.order.multiSend, undefined);
  assert.equal(batchBody.order.multiSendView.quantity, 1);
  assert.equal(batchBody.order.multiSendView.redacted, false);
  assert.deepEqual(Object.keys(batchBody.order.multiSendView.deliveries[0]).sort(), ["address", "greeting", "id", "message", "name", "needsSupport", "status"]);
  assert.equal(batchBody.order.multiSendView.deliveries[0].address.privateExtra, undefined);
  assert.equal(JSON.stringify(batchBody).includes("BATCH_SECRET"), false);
  assert.equal(JSON.stringify(batchBody).includes("NESTED_SECRET"), false);

  const legacyRead = await GET(request(`${endpoint}?token=${encodeURIComponent(viewToken)}`), params);
  const legacyBody = await legacyRead.json();
  assert.equal(legacyRead.status, 200, "legacy receipt URLs remain usable");
  assert.equal(legacyBody.readToken, sameReadToken, "legacy full-authority reads can expose the weaker read token");
  assert.equal(legacyBody.order.viewToken, undefined, "the raw checkout token is never returned");
  const adminRead = await GET(request(endpoint, { cookie: `${ADMIN_COOKIE_NAME}=${admin}` }), params);
  assert.equal((await adminRead.json()).readToken, sameReadToken);

  const retiredUnlock = await POST(request(endpoint, { "content-type": "application/json" }), params);
  assert.equal(retiredUnlock.status, 403);
  assert.match(retiredUnlock.headers.get("cache-control") || "", /private, no-store/);
  assert.equal(getBlockedExternalCalls().length, 0, "backend access tests do not call external services");

  console.log("Order access credentials: scoped HMAC authority, fail-closed API reads, legacy/admin compatibility, redaction, and no-network checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  uninstallSafeTestHarness();
  fs.rmSync(tempData, { recursive: true, force: true });
});
