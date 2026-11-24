import assert from "node:assert/strict";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import { ADMIN_COOKIE_NAME, generateAdminSessionToken } from "../lib/admin-auth";
import { firestoreDb } from "../lib/firebase-admin";
import {
  assertWeddingRuntime,
  isWeddingFounderCohortCookie,
  isWeddingFounderCohortRequest,
  weddingStorageEnvironment,
} from "../lib/wedding/server";
import { sendWeddingBatchConfirmationEmail } from "../lib/wedding/email";

async function main() {
  await withSafeTestHarness(async () => {
    // 1. Storage environment resolves to production when staging flags are absent
    const prevStaging = process.env.STAGING_REVIEW_ONLY;
    const prevProject = process.env.FIREBASE_PROJECT_ID;
    const prevNextProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const prevService = process.env.K_SERVICE;
    delete process.env.STAGING_REVIEW_ONLY;
    process.env.FIREBASE_PROJECT_ID = "sendmynotes-2a417";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "sendmynotes-2a417";
    delete process.env.K_SERVICE;
    assert.equal(weddingStorageEnvironment(), "production");

    // 2. Founder cohort cookie/request verification
    const adminToken = generateAdminSessionToken("zbrustkern@gmail.com");
    assert.equal(isWeddingFounderCohortCookie(adminToken), true);
    assert.equal(isWeddingFounderCohortCookie("forged.token"), false);

    const anonReq = new Request("https://sendmynotes.com/api/wedding/project");
    const founderReq = new Request("https://sendmynotes.com/api/wedding/project", {
      headers: { cookie: `${ADMIN_COOKIE_NAME}=${encodeURIComponent(adminToken)}` },
    });
    assert.equal(isWeddingFounderCohortRequest(anonReq), false);
    assert.equal(isWeddingFounderCohortRequest(founderReq), true);

    // 3. Receipt email mints a project-specific cross-device #wedding=<token> recovery URL
    const projectId = `proj_receipt_${Date.now()}`;
    const batchId = `wb_receipt_${Date.now()}`;
    await firestoreDb.collection("weddingProjects").doc(projectId).set({
      id: projectId,
      ownerId: "owner_actor_1",
      createdAt: Date.now(),
    });
    await firestoreDb.collection("weddingBatches").doc(batchId).set({
      id: batchId,
      projectId,
      status: "held",
      buyerEmail: "couple@example.invalid",
      capturedCents: 2700,
      quote: {
        count: 3,
        totalCents: 2700,
        lines: [
          { country: "US", totalCents: 900 },
          { country: "US", totalCents: 900 },
          { country: "US", totalCents: 900 },
        ],
      },
    });

    let capturedText = "";
    let capturedHtml = "";
    const emailResult = await sendWeddingBatchConfirmationEmail(batchId, {
      appUrl: "https://sendmynotes.com",
      sendEmail: async (payload) => {
        capturedText = payload.text;
        capturedHtml = payload.html;
        return { data: { id: "re_wedding_recovery_1" } };
      },
    });
    assert.equal(emailResult.sent, true);
    const match = capturedText.match(/https:\/\/sendmynotes\.com\/thank-you\/wedding#wedding=([a-f0-9]{64})/);
    assert.ok(match, "receipt email includes durable 64-hex #wedding recovery link");
    assert.ok(capturedHtml.includes(match![0]), "HTML receipt includes the same project recovery link");

    // Verify invite document exists in Firestore bound to projectId & owner_actor_1
    const invites = await firestoreDb.collection("weddingInvites").get();
    const matchingInvite = invites.docs.map((d: any) => d.data()).find((d: any) => d.projectId === projectId && d.kind === "device");
    assert.ok(matchingInvite, "device recovery invite stored in weddingInvites");
    assert.equal(matchingInvite.actorId, "owner_actor_1");

    // Restore env
    if (prevStaging !== undefined) process.env.STAGING_REVIEW_ONLY = prevStaging;
    if (prevProject !== undefined) process.env.FIREBASE_PROJECT_ID = prevProject;
    if (prevNextProject !== undefined) process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = prevNextProject;
    if (prevService !== undefined) process.env.K_SERVICE = prevService;

    // Non-production runtime passes normally
    assertWeddingRuntime(anonReq);
    console.log("wedding prod blockers: dynamic storageEnv, founder cohort auth, and cross-device recovery link passed");
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
