import sharp from "sharp";
import { optimizeCoverImage } from "../lib/image-optimizer";
import { saveImageCacheItem, getImageCachePoolCollection } from "../lib/firebase-admin";

async function testImageOptimization() {
  console.log("=================================================");
  console.log("🧪 RUNNING IMAGE COMPRESSION & FIRESTORE GUARD TESTS");
  console.log("=================================================");

  // 1. Generate an artificially bloated 2.5MB PNG data URL
  console.log("Creating 2.5MB synthetic PNG data URL...");
  const rawPng = await sharp({
    create: {
      width: 1024,
      height: 1433,
      channels: 4,
      background: { r: 150, g: 90, b: 220, alpha: 1 },
    },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();

  const oversizedDataUrl = `data:image/png;base64,${rawPng.toString("base64")}`;
  console.log(`Original image size: ${(oversizedDataUrl.length / 1024 / 1024).toFixed(2)} MB (${oversizedDataUrl.length} bytes)`);

  if (oversizedDataUrl.length <= 1048487) {
    throw new Error("Test image is not large enough to test the limit!");
  }
  console.log("✅ Verified: Original image exceeds Firestore 1,048,487 byte limit");

  // 2. Run through optimizeCoverImage
  console.log("Compressing through optimizeCoverImage...");
  const optimizedUrl = await optimizeCoverImage(oversizedDataUrl);
  console.log(`Optimized image size: ${(optimizedUrl.length / 1024).toFixed(1)} KB (${optimizedUrl.length} bytes)`);

  if (optimizedUrl.length >= 1048487) {
    throw new Error(`Optimized image still exceeds limit: ${optimizedUrl.length}`);
  }
  console.log("✅ PASS: Compressed image is safely under 1,048,487 bytes");

  // 3. Test saving an oversized item to saveImageCacheItem
  const testId = `test_guard_${Date.now()}`;
  console.log("Testing saveImageCacheItem with oversized payload...");
  await saveImageCacheItem({
    id: testId,
    occasion: "Test",
    prompt: "Test prompt",
    imageUrl: oversizedDataUrl, // Intentionally passing oversized image
    status: "AVAILABLE",
    createdAt: Date.now(),
  });

  const doc = await getImageCachePoolCollection().doc(testId).get();
  if (!doc.exists) {
    throw new Error("Document was not saved!");
  }
  const data = doc.data() as { imageUrl: string };
  console.log(`Saved document imageUrl length: ${(data.imageUrl.length / 1024).toFixed(1)} KB`);

  if (data.imageUrl.length >= 1048487) {
    throw new Error("Saved document imageUrl still exceeds limit!");
  }
  console.log("✅ PASS: saveImageCacheItem automatically guarded Firestore and compressed payload");

  console.log("=================================================");
  console.log("🎉 ALL IMAGE OPTIMIZATION TESTS PASSED!");
  console.log("=================================================");
}

testImageOptimization().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
