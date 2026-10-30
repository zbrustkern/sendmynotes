import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createArtworkRecoveryToken, verifyArtworkRecoveryToken, ARTWORK_RECOVERY_TTL_MS } from "../lib/artwork-recovery";
import { createInitialDraft, draftReducer, MemoryDraftStorage, loadResumableDraft, persistResumableDraft, DRAFT_STORAGE_KEY, DRAFT_EXPIRY_MS, loadDraft } from "../lib/draft";
import { firestoreDb } from "../lib/firebase-admin";
import { GET } from "../app/api/artwork/recover/route";
import { POST as telemetry } from "../app/api/telemetry/route";
import { buildEventV2Envelope } from "../lib/telemetry-v2-envelope";

async function main() {
  const now = Date.now(), id = "cache_1793367334287_owub6", secret = "recovery-test-only";
  const token = createArtworkRecoveryToken(id, secret, now);
  assert.equal(verifyArtworkRecoveryToken(token, secret, now), id);
  assert.equal(verifyArtworkRecoveryToken(token.replace(id, "cache_1793367334287_owub7"), secret, now), null);
  assert.equal(verifyArtworkRecoveryToken(token, "wrong", now), null);
  assert.equal(verifyArtworkRecoveryToken(token, secret, now + ARTWORK_RECOVERY_TTL_MS), null);
  assert.equal(verifyArtworkRecoveryToken(token + ".extra", secret, now), null);

  let draft = draftReducer(createInitialDraft(), { type: "SELECT_DESIGN", payload: { imageUrl: "data:image/png;base64,c2FtcGxl", title: "My custom art", source: "custom", accepted: true } });
  draft = draftReducer(draft, { type: "UPDATE_NOTE", payload: { text: "Words to keep", salutation: "Dear Friend", signOff: "Love, Me", style: "hwKate" } });
  draft = draftReducer(draft, { type: "SET_STEP", payload: "address" });
  draft = draftReducer(draft, { type: "SET_ADDRESS_DEFERRED", payload: true });
  draft = draftReducer(draft, { type: "SET_APPLIED_OFFER", payload: { code: "TEST", discountType: "FIXED_AMOUNT", discountValue: 300, discountAmountInCents: 300, finalAmountInCents: 600, isFree: false, appliedAt: now } });
  const device = new MemoryDraftStorage();
  assert.equal(persistResumableDraft(draft, new MemoryDraftStorage(), device), "device");
  const reopened = loadResumableDraft(new MemoryDraftStorage(), device)!;
  assert.equal(reopened.selectedDesign?.imageUrl, draft.selectedDesign?.imageUrl);
  assert.equal(reopened.lastCustomArtwork?.imageUrl, draft.selectedDesign?.imageUrl);
  assert.deepEqual(reopened.note, draft.note);
  assert.equal(reopened.currentStep, "address");
  assert.equal(reopened.addressDeferred, true);
  assert.equal(reopened.appliedOffer?.finalAmountInCents, 600);
  assert.equal(loadDraft(device, Date.now() + DRAFT_EXPIRY_MS + 5000), null);
  persistResumableDraft({ ...draft, completed: true }, new MemoryDraftStorage(), device);
  assert.equal(device.getItem(DRAFT_STORAGE_KEY), null);
  const denied = { getItem() { return null; }, setItem() { throw Error("quota"); }, removeItem() {} };
  assert.equal(persistResumableDraft(draft, new MemoryDraftStorage(), denied), "unavailable");

  process.env.ADMIN_SESSION_SIGNING_KEY = secret;
  await firestoreDb.collection("image_cache_pool").doc(id).set({ imageUrl: "/test-cover.png", occasion: "Thank You", prompt: "PRIVATE PROMPT", isGenerated: true });
  const good = await GET(new NextRequest(`http://localhost/api/artwork/recover?token=${token}`));
  assert.equal(good.status, 200);
  assert.equal(good.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await good.json(), { imageUrl: "/test-cover.png", occasion: "Thank You", title: "Recovered custom artwork" });
  const open = await GET(new NextRequest(`http://localhost/api/artwork/recover?token=${token}&open=1`));
  assert.equal(open.status, 303);
  assert.equal(open.headers.get("location"), "http://localhost/new?recover_artwork=1");
  assert.equal(open.cookies.get("smn_recovered_artwork")?.httpOnly, true);
  const cookieRead = await GET(new NextRequest("http://localhost/api/artwork/recover", { headers: { cookie: `smn_recovered_artwork=${token}` } }));
  assert.equal(cookieRead.status, 200);
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://sendmynotes.com";
  const hosted = await GET(new NextRequest(`http://0.0.0.0:8080/api/artwork/recover?token=${token}&open=1&discount=LAUNCHVIP600`));
  assert.equal(hosted.headers.get("location"), "https://sendmynotes.com/new?recover_artwork=1&discount=LAUNCHVIP600");
  if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
  assert.equal((await GET(new NextRequest("http://localhost/api/artwork/recover?token=bad"))).status, 404);

  const envelope = buildEventV2Envelope({ event_name: "checkout_failed", session_id: "sess_recovery_fixture", event_id: "evt_recovery_fixture", properties: { httpStatus: 400, errorCategory: "validation", handwrittenNote: "PRIVATE WORDS", address: { street: "PRIVATE" } } });
  const response = await telemetry(new NextRequest("http://localhost/api/telemetry", { method: "POST", body: JSON.stringify(envelope) }));
  assert.equal(response.status, 200);
  const stored = (await firestoreDb.collection("telemetry_events").doc(envelope.event_id).get()).data();
  assert.deepEqual(stored.metadata, { httpStatus: 400, errorCategory: "validation" });
  assert.equal(stored.sessionId, envelope.session_id);
  assert.equal(stored.timestamp, envelope.occurred_at);
  for (const name of ["payment_captured", "purchase_verified", "fulfillment_submitted"]) {
    const res = await telemetry(new NextRequest("http://localhost/api/telemetry", { method: "POST", body: JSON.stringify({ ...envelope, event_name: name }) }));
    assert.equal(res.status, 403, `${name} must remain server-only`);
  }
  console.log("PASS: artwork access scope/expiry, fresh-tab draft survival, expiry, completed cleanup, quota honesty, V2 ingestion and authority boundaries");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
