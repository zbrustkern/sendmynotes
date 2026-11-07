import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { withSafeTestHarness } from "../lib/testing/safe-harness";

async function run() {
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smn-post-purchase-links-"));
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  process.env.SMN_TEST_DATA_DIR = testDataDir;
  process.env.POST_PURCHASE_LINK_SECRET = "synthetic-test-link-secret-with-at-least-32-bytes";
  try { await withSafeTestHarness(async () => {
    const { firestoreDb } = await import("../lib/firebase-admin");
    const links = await import("../lib/post-purchase/links");
    const { GET, POST } = await import("../app/api/post-purchase/link/route");
    const collection = firestoreDb.collection("post_purchase_link_refs") as any;
    collection.store.clear();
    const at = Date.now();
    const input = { messageId: "message_synthetic", enrollmentId: "enrollment_synthetic", sourceOrderId: "order_synthetic", at };
    const created = await links.ensureFollowupLink(input);
    assert.match(created.reference, /^[A-Za-z0-9_-]{40,64}$/);
    assert.equal(new URL(created.url).searchParams.get("followupRef"), created.reference);
    assert.equal((await links.ensureFollowupLink(input)).reference, created.reference, "retry reuses the same purpose-bound reference");
    const hash = crypto.createHash("sha256").update(created.reference).digest("hex");
    const stored = (await collection.doc(hash).get()).data();
    assert.equal(stored.messageId, input.messageId);
    assert.equal(stored.environment, "test");
    assert.equal(JSON.stringify(stored).includes(created.reference), false, "raw bearer reference is not persisted");
    assert.equal((await links.resolveFollowupLink(created.reference, at + 1))?.sourceOrderId, input.sourceOrderId);
    assert.equal(await links.resolveFollowupLink(`${created.reference.slice(0, -1)}x`, at + 1), null, "unknown references are rejected");
    assert.equal(await links.resolveFollowupLink(created.reference, at + 91 * 24 * 60 * 60 * 1000), null, "expired references are rejected");

    const observationAt = at + 2_000;
    const getResponse = await GET(new NextRequest(`https://sendmynotes.com/api/post-purchase/link?reference=${created.reference}`));
    assert.equal(getResponse.status, 302);
    assert.equal((firestoreDb.collection("post_purchase_link_observations") as any).store.size, 0, "GET validation/redirect does not record a click");

    const gpc = await POST(new NextRequest("https://sendmynotes.com/api/post-purchase/link", { method: "POST", headers: { "content-type": "application/json", "sec-gpc": "1" }, body: JSON.stringify({ reference: created.reference, analyticsAllowed: true }) }));
    assert.equal((await gpc.json()).observed, false, "GPC suppresses link observation");
    assert.equal(await links.hasRecentFollowupLinkObservation(created.reference, observationAt, observationAt), false);

    const post = await POST(new NextRequest("https://sendmynotes.com/api/post-purchase/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference: created.reference, analyticsAllowed: true }) }));
    const observed = await post.json();
    assert.equal(post.status, 200);
    assert.equal(observed.observed, true);
    assert.equal(await links.hasRecentFollowupLinkObservation(created.reference, observed.observedAt, observed.observedAt), true);
    assert.equal(await links.hasRecentFollowupLinkObservation(created.reference, observed.observedAt, observed.observedAt + links.FOLLOWUP_LINK_OBSERVATION_WINDOW_MS + 1), false, "observation expires after seven days");
    const denied = await POST(new NextRequest("https://sendmynotes.com/api/post-purchase/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference: created.reference, analyticsAllowed: false }) }));
    assert.equal((await denied.json()).observed, false, "no analytics consent means no observation");
  }); } finally { fs.rmSync(testDataDir, { recursive: true, force: true }); }
  console.log("Post-purchase link privacy checks passed.");
}

void run();
