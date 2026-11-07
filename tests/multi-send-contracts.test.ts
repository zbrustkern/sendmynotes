import assert from "node:assert/strict";
import { allocateTotalCents, composeRecipientMessage, expectedMultiSendTotal, quoteMultiSend, resolveGreeting, validateMultiSendInput } from "../lib/multi-send/contracts";
import { setHouseholdAcknowledgements } from "../lib/multi-send/household";
import { parseMultiSendEditorBuffer } from "../lib/draft/multi-send-editor-buffer";

const note = { salutation: "Dear Friends,", text: "I hope you are well.", signOff: "Love, Sam", style: "warm" };
assert.equal(resolveGreeting(note.salutation, { mode: "inherit" }), "Dear Friends,");
assert.equal(resolveGreeting(note.salutation, { mode: "custom", text: "Dear Maya!" }), "Dear Maya!");
assert.equal(composeRecipientMessage(note, { mode: "inherit" }), "Dear Friends,\n\nI hope you are well.\n\nLove, Sam");
assert.equal(composeRecipientMessage(note, { mode: "custom", text: "" }), "I hope you are well.\n\nLove, Sam");
assert.equal(composeRecipientMessage({ ...note, salutation: "" }, { mode: "inherit" }), "I hope you are well.\n\nLove, Sam");

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
