import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { getOrdersCollection } from "../lib/firebase-admin";
import { POST } from "../app/api/webhooks/handwrytten/route";

async function main() {
  await withSafeTestHarness(async () => {
    delete process.env.HANDWRYTTEN_WEBHOOK_SECRET;
    const parentId = `webhook_batch_${Date.now()}`;
    await getOrdersCollection().doc(parentId).set({ id: parentId, status: "QUEUED_FOR_FULFILLMENT", fulfillmentStatus: "MULTI_SEND_PARTIAL", createdAt: Date.now(), multiSend: { version: 1, kind: "parent", recipients: [{ id: "r1" }] } });
    const childRef = getOrdersCollection().doc(parentId).collection("deliveries").doc("r1");
    await childRef.set({ parentOrderId: parentId, recipientId: "r1", state: "ACCEPTED", stateVersion: 2, supplierOrderId: "hw_batch_hook" });
    const req = (status: string, token?: string, id = "hw_batch_hook") => new NextRequest("http://localhost/api/webhooks/handwrytten", { method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-webhook-token": token } : {}) }, body: JSON.stringify({ order_id: id, status }) });
    const absentSecret = await POST(req("mailed"));
    assert.equal(absentSecret.status, 503, "batch webhook fails closed when no shared secret is configured");

    process.env.HANDWRYTTEN_WEBHOOK_SECRET = "synthetic-webhook-secret";
    const unauthorized = await POST(req("mailed", "wrong"));
    assert.equal(unauthorized.status, 401, "batch webhook rejects an invalid token");
    const negative = await POST(req("not sent", process.env.HANDWRYTTEN_WEBHOOK_SECRET));
    assert.equal(negative.status, 200);
    assert.equal((await childRef.get()).data()?.state, "ACCEPTED", "negative wording cannot be mapped to mailed");
    const mailed = await POST(req("mailed", process.env.HANDWRYTTEN_WEBHOOK_SECRET));
    assert.equal(mailed.status, 200);
    assert.equal((await childRef.get()).data()?.state, "MAILED");

    delete process.env.HANDWRYTTEN_WEBHOOK_SECRET;
    const legacyId = `webhook_legacy_${Date.now()}`;
    await getOrdersCollection().doc(legacyId).set({ id: legacyId, status: "PROCESSING_HANDWRYTTEN", handwryttenOrderId: "hw_legacy_hook", createdAt: Date.now() });
    const legacy = await POST(req("mailed", undefined, "hw_legacy_hook"));
    assert.equal(legacy.status, 200, "legacy webhook retains its existing optional-secret behavior");
    assert.equal((await getOrdersCollection().doc(legacyId).get()).data()?.status, "MAILED");
    console.log("multi-send webhook: batch auth, strict status mapping, and legacy fallback passed");
  });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
