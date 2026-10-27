import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Step3EnvelopeAddressing, isInternationalCountry } from "../components/v3/Step3EnvelopeAddressing";
import { Step5Confirmation } from "../components/v3/Step5Confirmation";

const common = {
  sender: { fullName: "Alex Sender", street1: "10 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
  onChangeSender: () => {},
  onChangeRecipient: () => {},
  fontClass: "",
  onBack: () => {},
  onContinue: () => {},
  hideFixedActionBar: true,
  displayTotalCents: 900,
};
const previewOptions = {
  enabled: false,
  previewAvailable: true,
  destinations: [
    { countryCode: "CA", countryName: "Canada", postalCodeRequired: true, regionRequired: true, available: false },
    { countryCode: "JP", countryName: "Japan", postalCodeRequired: true, regionRequired: false, available: false },
  ],
};

assert.equal(isInternationalCountry("United States of America"), false, "legacy US country names keep domestic behavior");
assert.equal(isInternationalCountry("GB"), true, "ISO country codes use the international path");

const disabled = renderToStaticMarkup(<Step3EnvelopeAddressing {...common} recipient={{ fullName: "Taylor", street1: "1 Oak", city: "Austin", state: "TX", zip: "78701", country: "US" }} mailingOptions={{ enabled: false, destinations: [] }} />);
assert(!disabled.includes("International? +$5"), "international entry stays hidden when server options are disabled");

const preview = renderToStaticMarkup(<Step3EnvelopeAddressing {...common} recipient={{ fullName: "Taylor", street1: "1 Oak", city: "Austin", state: "TX", zip: "78701", country: "US" }} mailingOptions={previewOptions} />);
assert(preview.includes("International? +$5"), "the server-controlled staging preview exposes the international editor entry");
assert(preview.includes("postage-domestic.webp"), "the ordinary US selection retains the illustrative domestic postage preview");

const international = renderToStaticMarkup(<Step3EnvelopeAddressing {...common} recipient={{ fullName: "Taylor Doe", street1: "1 Queen St", city: "Toronto", state: "ON", zip: "M5V 2T6", country: "CA" }} mailingOptions={previewOptions} isInternational onUseUSAddress={() => {}} displayTotalCents={1400} />);
assert(international.includes("Canada"), "the committed international recipient shows its country name");
assert(international.includes("Postage"), "the international envelope uses a neutral postage treatment");
assert(international.includes("$14.00"), "the international action price reflects the selected transaction total");
assert(international.includes("Illustrative preview · Postage design may vary."), "international preview retains the illustrative postage caption");
assert(!international.includes("postage-domestic.webp"), "international envelope preview does not depict domestic postage art");
assert(!international.includes("USPS First-Class"), "international envelope copy avoids domestic delivery claims");
assert(international.includes("Use a US address instead"), "the committed address can be switched back to the separate US draft");

const testModeAddress = renderToStaticMarkup(<Step3EnvelopeAddressing {...common} recipient={{ fullName: "Taylor Doe", street1: "1 Queen St", city: "Toronto", state: "ON", zip: "M5V 2T6", country: "CA" }} mailingOptions={{ ...previewOptions, enabled: true }} isInternational onUseUSAddress={() => {}} displayTotalCents={1400} />);
assert(testModeAddress.includes("Staging test only"), "an enabled Stripe-test preview says no physical card or mailing will occur");

const previewHold = renderToStaticMarkup(<Step5Confirmation
  orderId="order-preview-1" fulfillmentStatus="QUEUED_FOR_FULFILLMENT" cardTitle="A card" cardUrl="/card.jpg" occasion="Thinking of You"
  salutation="Dear Taylor" bodyNote="Thinking of you" signOff="Alex" fontClass=""
  recipient={{ fullName: "Taylor Doe", street1: "1 Queen St", city: "Toronto", state: "ON", zip: "M5V 2T6", country: "CA" }}
  sender={{ fullName: "Alex Sender", street1: "10 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" }}
  customerEmail="alex@example.com" amountInCents={1400} onSendAnotherCard={() => {}} isPreviewHold
/>);
assert(previewHold.includes("International Staging Test · Held"), "preview confirmation identifies the staging hold");
assert(previewHold.includes("No real charge or receipt email was sent"), "preview confirmation does not imply a live charge or delivered email");
assert(previewHold.includes("No card was printed or sent to fulfillment."), "preview confirmation explicitly says physical fulfillment did not start");
assert(previewHold.includes("Mailing not started"), "preview confirmation states mailing has not started");
assert(!previewHold.includes("Your Handwritten Card is in Motion"), "preview confirmation suppresses the ordinary in-motion claim");
assert(!previewHold.includes("Receipt dispatched to"), "preview confirmation suppresses the receipt-dispatched claim");
assert(!previewHold.includes("Real-Time Fulfillment Stepper"), "preview confirmation suppresses the ordinary fulfillment tracker heading");

const orderPage = readFileSync(new URL("../app/order/[id]/page.tsx", import.meta.url), "utf8");
assert(orderPage.includes('order.fulfillmentStatus === "INTERNATIONAL_PREVIEW_HOLD"'), "order page recognizes the backend preview-hold status");
assert(orderPage.includes("No real charge, receipt email, card printing, fulfillment, or mailing occurred."), "order page explains staging has no real-world side effects");
assert(orderPage.includes('title: isPreviewHold ? "Mailing not started"'), "order tracker does not claim a held preview was mailed");
assert(orderPage.includes('!data.order.isInternationalPreview && data.order.fulfillmentStatus !== "INTERNATIONAL_PREVIEW_HOLD"'), "order page suppresses purchase telemetry for held previews");

console.log("PASS international address UI behavior checks");
