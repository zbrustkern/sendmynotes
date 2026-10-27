import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnvelopePreview } from "../components/flow/EnvelopePreview";
import { FlowHeader } from "../components/flow/FlowHeader";

const sender = {
  fullName: "Sam Sender",
  street1: "456 Return Street",
  city: "Sampletown",
  state: "CA",
  zip: "90000",
  country: "US",
};

const unicodeRecipient = {
  fullName: "Zoë 李 🌿",
  street1: "長い通りの名前 12345678901234567890",
  street2: "Apartment 1204 — 北側",
  city: "São Paulo",
  state: "SP",
  zip: "01000-000",
  country: "BR",
};

const envelope = renderToStaticMarkup(
  <EnvelopePreview sender={sender} recipient={unicodeRecipient} />,
);
assert.match(envelope, /aria-label="Recipient address"/);
assert.match(envelope, /mx-auto flex w-full min-w-0 items-center justify-center/);
assert.match(envelope, /w-fit min-w-0 max-w-full text-left/);
assert.match(envelope, /\[overflow-wrap:anywhere\]/);
assert.match(envelope, /Zoë 李 🌿/);
assert.match(envelope, /Apartment 1204 — 北側/);
assert.match(envelope, /São Paulo, SP 01000-000/);

const deferred = renderToStaticMarkup(
  <EnvelopePreview sender={sender} recipient={unicodeRecipient} isAddressDeferred />,
);
assert.match(deferred, /Street address to be added later/);
assert.doesNotMatch(deferred, /長い通りの名前/);

const header = renderToStaticMarkup(
  <FlowHeader showClearDraft onClearDraft={() => {}} orderTotalCents={1275} />,
);
assert.match(header, /\$12\.75 total/);
assert.match(header, /aria-label="Card options"/);
assert.match(header, /aria-haspopup="menu"/);
assert.doesNotMatch(header, /\$9\.00/);
assert.doesNotMatch(header, /First-Class Stamp Included|Real Ballpoint Ink/);

const busyHeader = renderToStaticMarkup(
  <FlowHeader showClearDraft onClearDraft={() => {}} orderTotalCents={0} resetDisabled />,
);
assert.match(busyHeader, /\$0\.00 total/);
assert.match(busyHeader, /disabled="" aria-label="Card options"/);
assert.doesNotMatch(busyHeader, /\$9\.00/);

console.log("Sprint 0021 visual component checks passed.");
