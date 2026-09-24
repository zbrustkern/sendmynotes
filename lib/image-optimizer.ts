import sharp from "sharp";
import * as admin from "firebase-admin";

/**
 * Optimizes an image (base64 data URL or Buffer) to a standard 5:7 portrait greeting card JPEG.
 * Ensures the image payload is well within Cloud Firestore's 1,048,487 byte single-property limit.
 * If Firebase Storage is available and accessible, optionally uploads to bucket.
 */
export async function optimizeCoverImage(input: string | Buffer): Promise<string> {
  let buffer: Buffer;

  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else if (typeof input === "string" && input.startsWith("data:")) {
    const base64Index = input.indexOf("base64,");
    if (base64Index === -1) return input;
    const base64Data = input.substring(base64Index + 7);
    buffer = Buffer.from(base64Data, "base64");
  } else {
    // If it's already an http(s) URL, return directly
    return input;
  }

  // 1. Resize to 875x1225 (exact 5:7 portrait greeting card ratio) and compress to JPEG
  let optimizedBuffer = await sharp(buffer)
    .resize(875, 1225, { fit: "cover", position: "center" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  // 2. Strict guard against Firestore 1,048,487-byte limit:
  // Base64 encoding inflates byte size by ~33%. A 500KB buffer produces ~667KB base64.
  // If buffer is larger than 450KB, reduce quality and dimensions to guarantee safety.
  if (optimizedBuffer.length > 450 * 1024) {
    optimizedBuffer = await sharp(buffer)
      .resize(750, 1050, { fit: "cover", position: "center" })
      .jpeg({ quality: 72 })
      .toBuffer();
  }

  // 3. Optional: Attempt upload to Firebase Storage if bucket is reachable
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (bucketName && admin.apps.length > 0) {
    try {
      const bucket = admin.storage().bucket(bucketName);
      const filename = `covers/cover_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
      const file = bucket.file(filename);

      await file.save(optimizedBuffer, {
        contentType: "image/jpeg",
        metadata: {
          cacheControl: "public, max-age=31536000",
        },
      });

      // Try making the file public or using Firebase download URL format
      try {
        await file.makePublic();
        return `https://storage.googleapis.com/${bucket.name}/${filename}`;
      } catch {
        // Fallback: Use standard Google Cloud Storage download link
        return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
          filename
        )}?alt=media`;
      }
    } catch (storageErr) {
      // Non-fatal: Bucket not initialized or permissions pending.
      // Log note and safely fall back to the optimized base64 data URL.
      console.warn(
        "[Image Optimizer] Storage upload skipped, using optimized inline data URL:",
        storageErr instanceof Error ? storageErr.message : storageErr
      );
    }
  }

  // 4. Return optimized JPEG data URL (typically ~80KB-140KB, safely <15% of Firestore limit)
  return `data:image/jpeg;base64,${optimizedBuffer.toString("base64")}`;
}
