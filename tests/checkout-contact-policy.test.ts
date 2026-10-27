import assert from "node:assert/strict";
import { contactEmailChoice, effectiveOrderEmail, normalizeCheckoutEmail, checkoutEmailRequired } from "../lib/checkout-contact-policy";
import { createInitialDraft, draftReducer } from "../lib/draft/reducer";
import { sanitizeDraftState } from "../lib/draft/store";

const baseOrder = { id: "order_test", customerEmail: "old@example.com", status: "PENDING_PAYMENT" } as any;

assert.equal(normalizeCheckoutEmail("  Sender@Example.com "), "sender@example.com");
assert.equal(normalizeCheckoutEmail(""), "");
assert.equal(normalizeCheckoutEmail("bad address"), null);
assert.equal(contactEmailChoice("  "), "omitted");
assert.equal(contactEmailChoice("me@example.com"), "provided");
assert.equal(checkoutEmailRequired(true, ""), true);
assert.equal(checkoutEmailRequired(true, "sender@example.com"), false);
assert.equal(checkoutEmailRequired(false, ""), false);
assert.equal(effectiveOrderEmail({ ...baseOrder, contactEmailChoice: "omitted" }, "wallet@example.com"), "");
assert.equal(effectiveOrderEmail({ ...baseOrder, contactEmailChoice: "provided", contactEmailSyncStatus: "synced" }, "wallet@example.com"), "old@example.com");
assert.equal(effectiveOrderEmail({ ...baseOrder, contactEmailChoice: "provided", contactEmailSyncStatus: "pending" }, "wallet@example.com"), "", "unsynchronized preferences suppress every email source");
assert.equal(effectiveOrderEmail(baseOrder, "wallet@example.com"), "wallet@example.com", "legacy orders retain historical fallback");

const initial = createInitialDraft();
const edited = draftReducer(initial, { type: "SET_CHECKOUT_CONTACT", payload: { email: "", choice: "omitted" } });
const restored = sanitizeDraftState(JSON.parse(JSON.stringify(edited)));
assert.equal(restored?.checkoutContact.choice, "omitted");
assert.equal(restored?.checkoutContact.email, "", "deliberate clearing survives draft reload");

console.log("checkout contact policy tests passed");
