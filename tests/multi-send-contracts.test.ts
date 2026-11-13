import assert from "node:assert/strict";
import {
  allocateTotalCents,
  composeRecipientMessage,
  expectedMultiSendTotal,
  formatTwoLineSignOff,
  normalizeBodyText,
  normalizeGreetingText,
  normalizeSignOffText,
  quoteMultiSend,
  resolveGreeting,
  validateMultiSendInput,
} from "../lib/multi-send/contracts";
import { findInheritedGreetingNameMismatches } from "../lib/multi-send/greeting-guard";
import { setHouseholdAcknowledgements } from "../lib/multi-send/household";
import { parseMultiSendEditorBuffer } from "../lib/draft/multi-send-editor-buffer";
import { resolvePreviewMessage, resolveStep2PreviewMessage } from "../lib/note-preview";
import { buildSingleStepOrderPayload } from "../lib/handwrytten";
import { extractSenderName } from "../components/v3/TargetPurchaseExperience";

const note = { salutation: "Dear Friends,", text: "I hope you are well.", signOff: "Love, Sam", style: "warm" };
assert.equal(resolveGreeting(note.salutation, { mode: "inherit" }), "Dear Friends,");
assert.equal(resolveGreeting(note.salutation, { mode: "custom", text: "Dear Maya!" }), "Dear Maya!");
assert.equal(composeRecipientMessage(note, { mode: "inherit" }), "Dear Friends,\n\nI hope you are well.\n\nLove, Sam");
assert.equal(composeRecipientMessage(note, { mode: "custom", text: "" }), "I hope you are well.\n\nLove, Sam");
assert.equal(composeRecipientMessage({ ...note, salutation: "" }, { mode: "inherit" }), "I hope you are well.\n\nLove, Sam");

// C1 — Greeting-to-body spacing & whitespace/newline normalization
assert.equal(normalizeGreetingText("   "), "");
assert.equal(normalizeGreetingText("  Dear   Maya,\n\n "), "Dear Maya,");
assert.equal(
  composeRecipientMessage(note, { mode: "custom", text: "   \n  " }),
  "I hope you are well.\n\nLove, Sam",
  "whitespace-only custom greeting must produce zero leading blank lines"
);
assert.equal(
  composeRecipientMessage(
    { salutation: "Dear Maya,\n\n", text: "\nI hope you are well.\n\n\nWe miss you!\n\n", signOff: "Warmly,\n\nEzekiel\n", style: "hwDavid" },
    { mode: "inherit" },
  ),
  "Dear Maya,\n\nI hope you are well.\n\nWe miss you!\n\nWarmly,\nEzekiel",
  "trailing newlines in greeting/body/sign-off never produce \\n\\n\\n"
);

// C2 — Two-line sign-off cadence & parity with Step 2 preview and Handwrytten payload
assert.equal(formatTwoLineSignOff("Warmly, Ezekiel"), "Warmly,\nEzekiel");
assert.equal(formatTwoLineSignOff("With all our love, Sarah & Tom"), "With all our love,\nSarah & Tom");
assert.equal(formatTwoLineSignOff("Warmly,\nEzekiel"), "Warmly,\nEzekiel");
assert.equal(normalizeSignOffText("Warmly,\n\nEzekiel\n"), "Warmly,\nEzekiel");
assert.equal(extractSenderName("Warmly,\nEzekiel"), "Ezekiel");
assert.equal(extractSenderName("With all our love,\nSarah & Tom"), "Sarah & Tom");
assert.equal(extractSenderName("Warmly, Ezekiel"), "Ezekiel");
assert.equal(extractSenderName("Warmly,"), "");

const twoLineSignOffNote = {
  salutation: "Dear Maya,",
  text: "Thinking of you this season.",
  signOff: formatTwoLineSignOff("Warmly, Ezekiel"),
  style: "hwDavid",
};
const expectedCanonicalLetter = "Dear Maya,\n\nThinking of you this season.\n\nWarmly,\nEzekiel";
assert.equal(composeRecipientMessage(twoLineSignOffNote, { mode: "inherit" }), expectedCanonicalLetter);
assert.equal(
  resolveStep2PreviewMessage(twoLineSignOffNote.salutation, twoLineSignOffNote.text, twoLineSignOffNote.signOff),
  expectedCanonicalLetter,
);
const hwPayload = buildSingleStepOrderPayload(
  {
    orderId: "test_c1_c2",
    imageUrl: "/card.png",
    handwrittenMessage: expectedCanonicalLetter,
    exactMessage: true,
    fontId: "hwDavid",
    recipient: { firstName: "Maya", lastName: "Jones", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
    returnAddress: { firstName: "Ezekiel", lastName: "Sender", street1: "2 Main St", city: "Chicago", state: "IL", zip: "60601", country: "US" },
  },
  "card_123",
  true,
);
assert.equal(hwPayload.message, expectedCanonicalLetter);
assert.equal(resolvePreviewMessage("  Dear Maya,\n", "\nThinking of you.\n\nWarmly,\nEzekiel\n"), "Dear Maya,\n\nThinking of you.\n\nWarmly,\nEzekiel");

// C4 — Single-name carryover guard
const sarahAddr = { firstName: "Sarah", lastName: "Lee", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601" };
const bobAddr = { firstName: "Uncle Bob", lastName: "Smith", street1: "2 Oak Ave", city: "Chicago", state: "IL", zip: "60602" };
const mismatches = findInheritedGreetingNameMismatches("Dear Sarah,", [
  { id: "r1", address: sarahAddr, greeting: { mode: "inherit" } },
  { id: "r2", address: bobAddr, greeting: { mode: "inherit" } },
]);
assert.equal(mismatches.length, 1);
assert.equal(mismatches[0].recipientId, "r2");
assert.equal(mismatches[0].recipientDisplayName, "Uncle Bob Smith");
assert.equal(mismatches[0].matchedRecipientDisplayName, "Sarah Lee");
assert.equal(mismatches[0].defaultGreeting, "Dear Sarah,");

// Generic collective or holiday greetings do not warn
assert.equal(
  findInheritedGreetingNameMismatches("Dear friends,", [
    { id: "r1", address: sarahAddr, greeting: { mode: "inherit" } },
    { id: "r2", address: bobAddr, greeting: { mode: "inherit" } },
  ]).length,
  0,
);
assert.equal(
  findInheritedGreetingNameMismatches("Happy Holidays,", [
    { id: "r1", address: sarahAddr, greeting: { mode: "inherit" } },
    { id: "r2", address: bobAddr, greeting: { mode: "inherit" } },
  ]).length,
  0,
);
// Customized or explicitly kept greeting on Recipient 2 clears the mismatch
assert.equal(
  findInheritedGreetingNameMismatches("Dear Sarah,", [
    { id: "r1", address: sarahAddr, greeting: { mode: "inherit" } },
    { id: "r2", address: bobAddr, greeting: { mode: "custom", text: "Dear Uncle Bob," } },
  ]).length,
  0,
);
assert.equal(
  findInheritedGreetingNameMismatches("Dear Sarah,", [
    { id: "r1", address: sarahAddr, greeting: { mode: "inherit" } },
    { id: "r2", address: bobAddr, greeting: { mode: "custom", text: "Dear Sarah," } },
  ]).length,
  0,
);
// Same first name on Recipient 2 does not warn
assert.equal(
  findInheritedGreetingNameMismatches("Dear Sarah,", [
    { id: "r1", address: sarahAddr, greeting: { mode: "inherit" } },
    { id: "r2", address: { ...bobAddr, firstName: "Sarah", lastName: "Jenkins" }, greeting: { mode: "inherit" } },
  ]).length,
  0,
);

const address = { firstName: "Maya", lastName: "Jones", street1: "1 Main St", city: "Chicago", state: "IL", zip: "60601" };
const valid = { version: 1, checkoutId: "123e4567-e89b-42d3-a456-426614174000", note, recipients: [
  { id: "r1", address, greeting: { mode: "inherit" } },
  { id: "r2", address: { ...address, firstName: "Lee" }, greeting: { mode: "custom", text: "Dear Lee," } },
] };
assert.equal(validateMultiSendInput(valid), true);
assert.equal(validateMultiSendInput({ ...valid, recipients: [valid.recipients[0]] }), false);
assert.equal(validateMultiSendInput({ ...valid, recipients: [valid.recipients[0], valid.recipients[0]] }), false);
assert.equal(validateMultiSendInput({ ...valid, recipients: Array.from({ length: 26 }, (_, i) => ({ ...valid.recipients[0], id: `r${i}` })) }), false);
assert.deepEqual(quoteMultiSend(3), { basePriceCents: 2700, discountCents: 0, totalCents: 2700 });
assert.deepEqual(quoteMultiSend(3, 180), { basePriceCents: 2700, discountCents: 180, totalCents: 2520 });
assert.deepEqual(quoteMultiSend(2), { basePriceCents: 1800, discountCents: 0, totalCents: 1800 });
assert.equal(expectedMultiSendTotal(2), 1800, "batch display uses quantity at regular price");
assert.equal(expectedMultiSendTotal(1), 900, "one-recipient draft can be displayed before reaching batch minimum");
assert.equal(expectedMultiSendTotal(3, 720), 2520, "batch display applies a single-card discount once");
assert.equal(expectedMultiSendTotal(3, 0), 1800, "a free single-card offer still leaves the additional cards payable");
assert.deepEqual(quoteMultiSend(3, 1800), { basePriceCents: 2700, discountCents: 900, totalCents: 1800 });
assert.deepEqual(allocateTotalCents(2520, 3), [840, 840, 840]);
assert.deepEqual(allocateTotalCents(100, 3), [34, 33, 33]);
const household: Array<{ id: string; householdAcknowledgedWith?: Array<{ id: string; addressKey: string }> }> = [
  { id: "a", householdAcknowledgedWith: [{ id: "b", addressKey: "old" }] },
  { id: "b", householdAcknowledgedWith: [{ id: "a", addressKey: "old" }] },
  { id: "c", householdAcknowledgedWith: [{ id: "d", addressKey: "other" }] },
  { id: "d", householdAcknowledgedWith: [{ id: "c", addressKey: "other" }] },
];
const newHouseholdMember = setHouseholdAcknowledgements([...household, { id: "e" }], "e", ["a", "b"], "new");
assert.deepEqual(newHouseholdMember.find((row) => row.id === "e")?.householdAcknowledgedWith, [{ id: "a", addressKey: "new" }, { id: "b", addressKey: "new" }]);
assert(newHouseholdMember.find((row) => row.id === "a")?.householdAcknowledgedWith?.some((ack) => ack.id === "e" && ack.addressKey === "new"));
assert(newHouseholdMember.find((row) => row.id === "b")?.householdAcknowledgedWith?.some((ack) => ack.id === "e" && ack.addressKey === "new"));
const editedHousehold = setHouseholdAcknowledgements(household, "a", ["b"], "current");
assert.deepEqual(editedHousehold.find((row) => row.id === "a")?.householdAcknowledgedWith, [{ id: "b", addressKey: "current" }]);
assert.deepEqual(editedHousehold.find((row) => row.id === "b")?.householdAcknowledgedWith, [{ id: "a", addressKey: "current" }]);
assert.deepEqual(editedHousehold.find((row) => row.id === "c")?.householdAcknowledgedWith, [{ id: "d", addressKey: "other" }]);
const editorBuffer = { checkoutId: valid.checkoutId, mode: "greeting", recipientId: "r2", text: "" };
assert.deepEqual(parseMultiSendEditorBuffer(JSON.stringify(editorBuffer), valid.checkoutId), editorBuffer);
assert.equal(parseMultiSendEditorBuffer(JSON.stringify(editorBuffer), "different-checkout"), null);
console.log("multi-send contracts passed");
