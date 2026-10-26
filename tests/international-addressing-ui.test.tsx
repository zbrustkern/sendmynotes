import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Step3EnvelopeAddressing, isInternationalCountry } from "../components/v3/Step3EnvelopeAddressing";

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
assert(preview.includes("USPS Forever Stamp"), "the ordinary US selection retains the domestic postage preview");

const international = renderToStaticMarkup(<Step3EnvelopeAddressing {...common} recipient={{ fullName: "Taylor Doe", street1: "1 Queen St", city: "Toronto", state: "ON", zip: "M5V 2T6", country: "CA" }} mailingOptions={previewOptions} isInternational onUseUSAddress={() => {}} displayTotalCents={1400} />);
assert(international.includes("Canada"), "the committed international recipient shows its country name");
assert(international.includes("$14.00"), "the international action price reflects the selected transaction total");
assert(international.includes("International mailing destination preview"), "international envelope copy identifies its destination");
assert(!international.includes("USPS Forever Stamp"), "international envelope preview does not depict a USPS stamp");
assert(!international.includes("USPS First-Class"), "international envelope copy avoids domestic delivery claims");
assert(international.includes("Use a US address instead"), "the committed address can be switched back to the separate US draft");

console.log("PASS international address UI behavior checks");
