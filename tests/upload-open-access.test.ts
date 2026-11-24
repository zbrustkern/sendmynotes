import assert from "node:assert/strict";
import { withSafeTestHarness } from "../lib/testing/safe-harness";
import {
  evaluateUploadGrant,
  getPrivateAsset,
  getUploadAccess,
  markGenerationStarted,
  requireActiveGrant,
  reserveGeneration,
  uploadCollections,
} from "../lib/upload/access";

async function main() {
  await withSafeTestHarness(async () => {
    const uidA = "verified_new_user_a";
    const uidB = "verified_new_user_b";
    const assetId = "asset_open_studio_a";
    const now = Date.now();
    const dayKey = new Date(now).toISOString().slice(0, 10);

    // Seed an uploaded source asset owned by Account A
    await uploadCollections.col("uploadAssets").doc(uploadCollections.envKey(assetId)).set({
      id: assetId,
      uid: uidA,
      key: `upload-private/test/owner_a/source/${assetId}.png`,
      width: 1200,
      height: 1600,
      mimeType: "image/png",
      createdAt: now,
      expiresAt: now + 7 * 86_400_000,
    });

    // 1. Default (closed): ungranted account is denied
    delete process.env.UPLOAD_OPEN_TO_ACCOUNTS;
    const closedAccess = await getUploadAccess(uidA);
    assert.equal(closedAccess.allowed, false);
    assert.equal(closedAccess.reason, "not_entitled");
    await assert.rejects(() => requireActiveGrant(uidA, "work"), /access is unavailable/i);

    // 2. Open-to-accounts enabled with default 5/day per user + global cap
    process.env.UPLOAD_OPEN_TO_ACCOUNTS = "true";
    process.env.UPLOAD_DEFAULT_DAILY_LIMIT = "2";
    process.env.UPLOAD_GLOBAL_DAILY_LIMIT = "3";

    const openAccess = await getUploadAccess(uidA);
    assert.equal(openAccess.allowed, true);
    assert.equal(openAccess.dailyLimit, 2);
    const activeGrant = await requireActiveGrant(uidA, "work");
    assert.equal(activeGrant.uid, uidA);
    assert.equal(activeGrant.dailyLimit, 2);

    // Reserve + markGenerationStarted succeeds without any stored uploadAccess doc
    const gen1 = await reserveGeneration(uidA, "op_open_studio_0001", "hash_1", assetId, 1, "watercolor garden");
    assert.equal(gen1.replay, false);
    await markGenerationStarted(uidA, gen1.generation.id, assetId);

    // Mark gen1 ready so user can reserve gen2
    await uploadCollections.col("uploadGenerations").doc(uploadCollections.envKey(gen1.generation.id)).set(
      { ...gen1.generation, status: "ready" }
    );

    const gen2 = await reserveGeneration(uidA, "op_open_studio_0002", "hash_2", assetId, 1, "botanical wreath");
    await markGenerationStarted(uidA, gen2.generation.id, assetId);
    await uploadCollections.col("uploadGenerations").doc(uploadCollections.envKey(gen2.generation.id)).set(
      { ...gen2.generation, status: "ready" }
    );

    // 3rd generation for Account A hits per-account daily cap (2)
    await assert.rejects(
      () => reserveGeneration(uidA, "op_open_studio_0003", "hash_3", assetId, 1, "third try"),
      /Daily generation allowance reached/i
    );

    // 3. Cross-account isolation: Account B cannot read Account A's asset
    assert.equal(await getPrivateAsset(uidB, assetId), null);
    assert.ok(await getPrivateAsset(uidA, assetId));

    // 4. Global daily cap (3): Account B gets 1 generation (total=3), then 2nd is blocked by global cap
    const assetIdB = "asset_open_studio_b";
    await uploadCollections.col("uploadAssets").doc(uploadCollections.envKey(assetIdB)).set({
      id: assetIdB,
      uid: uidB,
      key: `upload-private/test/owner_b/source/${assetIdB}.png`,
      width: 1200,
      height: 1600,
      mimeType: "image/png",
      createdAt: now,
      expiresAt: now + 7 * 86_400_000,
    });
    const genB1 = await reserveGeneration(uidB, "op_open_studio_b001", "hash_b1", assetIdB, 1, "meadow");
    await markGenerationStarted(uidB, genB1.generation.id, assetIdB);
    await uploadCollections.col("uploadGenerations").doc(uploadCollections.envKey(genB1.generation.id)).set(
      { ...genB1.generation, status: "ready" }
    );
    const globalDoc = (await uploadCollections.col("uploadGlobalQuota").doc(uploadCollections.envKey(dayKey)).get()).data();
    assert.equal(globalDoc?.used, 3);

    await assert.rejects(
      () => reserveGeneration(uidB, "op_open_studio_b002", "hash_b2", assetIdB, 1, "over global cap"),
      /at capacity for today/i
    );

    // 5. Explicit admin revocation overrides open-account policy everywhere
    await uploadCollections.col("uploadAccess").doc(uploadCollections.envKey(uidA)).set({
      uid: uidA,
      email: "usera@example.invalid",
      expiresAt: now + 30 * 86_400_000,
      dailyLimit: 10,
      revoked: true,
      grantedAt: now,
      grantedBy: "admin",
    });
    const revokedAccess = await getUploadAccess(uidA);
    assert.equal(revokedAccess.allowed, false);
    assert.equal(revokedAccess.reason, "revoked");
    await assert.rejects(() => requireActiveGrant(uidA, "read"), /access is unavailable/i);
    assert.equal(
      evaluateUploadGrant(uidA, {
        uid: uidA,
        email: "usera@example.invalid",
        expiresAt: now + 30 * 86_400_000,
        dailyLimit: 10,
        revoked: true,
        grantedAt: now,
        grantedBy: "admin",
      }).allowed,
      false
    );

    console.log("upload open-access policy: unified grant checks, per-user cap, global spend cap, isolation, and revocation passed");
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
