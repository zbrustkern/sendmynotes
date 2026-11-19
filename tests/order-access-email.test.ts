import assert from "node:assert/strict";
import { installSafeTestHarness, uninstallSafeTestHarness, getBlockedExternalCalls } from "../lib/testing/safe-harness";
import type { Order } from "../lib/types";
import { createOrderReadToken } from "../lib/order-access-credentials";
import { sendDeferredAddressReceiptEmail, sendOrderPenningReceiptEmail } from "../lib/email/transactional";

process.env.NEXT_PUBLIC_APP_URL = "https://staging.example.test";
installSafeTestHarness();
const observedLogs: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
console.log = (...args: unknown[]) => observedLogs.push(args.map(String).join(" "));
console.error = (...args: unknown[]) => observedLogs.push(args.map(String).join(" "));

const checkoutToken = `tok_${"fedcba9876543210".repeat(2)}`;
const baseOrder = {
  id: "order_email_single",
  stripePaymentId: "pi_secret_should_not_appear_in_private_link",
  customerEmail: "sender@example.test",
  recipientAddress: { firstName: "Riley", lastName: "Example", street1: "10 Fictional Road", city: "Sampletown", state: "IL", zip: "60601", country: "US" },
  returnAddress: { firstName: "Casey", lastName: "Sender", street1: "11 Fictional Road", city: "Sampletown", state: "IL", zip: "60602", country: "US" },
  handwrittenNote: "A synthetic thank-you note.",
  printedMessage: "Dear Riley,",
  fontStyleId: "1",
  frontImageUrl: "/presets/thank-you.jpg",
  status: "PROCESSING_HANDWRYTTEN",
  addressDeferred: false,
  address_deferred: false,
  viewToken: checkoutToken,
  amountInCents: 900,
  createdAt: 10,
  updatedAt: 20,
} as unknown as Order;

const capture = () => {
  const messages: any[] = [];
  return {
    messages,
    sender: async (payload: any) => {
      messages.push(payload);
      return { data: { id: "synthetic-email-id" }, error: null };
    },
  };
};

async function main() {
  const deferredCapture = capture();
  const deferred = await sendDeferredAddressReceiptEmail({ order: { ...baseOrder, addressDeferred: true, address_deferred: true } as Order, customerEmail: "sender@example.test" }, deferredCapture.sender);
  assert.equal(deferred.success, true);
  const deferredPayload = deferredCapture.messages[0];
  const readToken = createOrderReadToken(baseOrder.id, checkoutToken)!;
  const expectedPrivateUrl = `https://staging.example.test/order/${baseOrder.id}#read=${readToken}`;
  const expectedAddressUrl = `https://staging.example.test/orders/${baseOrder.id}/complete-address#address=${checkoutToken}`;
  assert.ok(deferredPayload.text.includes(expectedPrivateUrl), "deferred text receipt has the private read link");
  assert.ok(deferredPayload.html.includes(expectedPrivateUrl), "deferred HTML receipt has the private read link");
  assert.ok(deferredPayload.text.includes(expectedAddressUrl), "the deferred address action remains distinct");
  assert.ok(deferredPayload.html.includes(expectedAddressUrl), "the HTML address action remains distinct");
  assert.doesNotMatch(deferredPayload.text + deferredPayload.html, /complete-address\?token=/, "new address links keep their token outside request URLs");
  assert.ok(deferredPayload.text.indexOf("NEXT STEP — ADD MAILING ADDRESS") < deferredPayload.text.indexOf("VIEW MY ORDER"));
  assert.equal(deferredPayload.subject.includes(readToken), false);
  assert.equal(deferredPayload.text.includes("pi_secret_should_not_appear_in_private_link"), false);

  const standardCapture = capture();
  const standard = await sendOrderPenningReceiptEmail({ order: baseOrder, customerEmail: "sender@example.test" }, standardCapture.sender);
  assert.equal(standard.success, true);
  const standardPayload = standardCapture.messages[0];
  assert.ok(standardPayload.text.includes(expectedPrivateUrl), "standard text receipt has the private read link");
  assert.ok(standardPayload.html.includes(expectedPrivateUrl), "standard HTML receipt has the private read link");
  assert.ok(standardPayload.text.includes("VIEW MY ORDER"));
  assert.ok(standardPayload.html.includes("View my order"));
  assert.equal(standardPayload.text.includes(checkoutToken), false, "standard read links do not expose the checkout credential");

  const batchOrder = {
    ...baseOrder,
    id: "order_email_batch",
    viewToken: `tok_${"0011223344556677".repeat(2)}`,
    multiSend: { kind: "parent", recipients: [{ id: "recipient_1" }, { id: "recipient_2" }] },
  } as unknown as Order;
  const batchCapture = capture();
  const batch = await sendOrderPenningReceiptEmail({ order: batchOrder, customerEmail: "sender@example.test" }, batchCapture.sender);
  assert.equal(batch.success, true);
  const batchPayload = batchCapture.messages[0];
  const batchReadToken = createOrderReadToken(batchOrder.id, batchOrder.viewToken!)!;
  const batchPrivateUrl = `https://staging.example.test/order/${batchOrder.id}#read=${batchReadToken}`;
  assert.ok(batchPayload.text.includes(batchPrivateUrl), "batch text receipt has its own order-scoped private link");
  assert.ok(batchPayload.html.includes(batchPrivateUrl), "batch HTML receipt has its own order-scoped private link");
  assert.equal(batchPayload.text.includes(checkoutToken), false);

  const missingTokenOrder = { ...baseOrder, id: "order_email_legacy_missing_token", viewToken: undefined } as unknown as Order;
  const missingDeferred = capture();
  await sendDeferredAddressReceiptEmail({ order: { ...missingTokenOrder, addressDeferred: true, address_deferred: true } as Order, customerEmail: "sender@example.test" }, missingDeferred.sender);
  const missingDeferredPayload = missingDeferred.messages[0];
  assert.equal(missingDeferredPayload.text.includes("complete-address#address="), false, "older deferred orders do not get an empty write link");
  assert.equal(missingDeferredPayload.text.includes("#read="), false, "older orders without a checkout token do not get a fabricated read credential");
  assert.equal(missingDeferredPayload.html.includes("href=\"null\""), false);

  const missingStandard = capture();
  await sendOrderPenningReceiptEmail({ order: missingTokenOrder, customerEmail: "sender@example.test" }, missingStandard.sender);
  assert.equal(missingStandard.messages[0].text.includes("#read="), false);
  assert.equal(observedLogs.some((line) => line.includes(readToken) || line.includes(batchReadToken) || line.includes(checkoutToken)), false, "credential tokens are absent from logs");
  assert.equal(getBlockedExternalCalls().length, 0, "email rendering tests use synthetic senders and deny external network access");
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.log("Order access email: private links render in standard, batch and deferred receipts, with separate address action and safe legacy fallback.");
}

main().catch((error) => {
  originalConsoleError(error);
  process.exitCode = 1;
}).finally(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  uninstallSafeTestHarness();
});
