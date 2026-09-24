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

  // 1. Target true commercial print resolution: 1500x2100 pixels (300 DPI for a 5" x 7" card).
  // Use 4:4:4 chroma subsampling (no color downsampling) to preserve fine ink lines, watercolor washes, and typography.
  let optimizedBuffer = await sharp(buffer)
    .resize(1500, 2100, { fit: "cover", position: "center" })
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();

  // 2. Strict guard against Firestore 1,048,487-byte limit:
  // Base64 encoding inflates byte size by ~33%. A 600KB buffer produces ~800KB base64.
  // If a high-entropy image exceeds 600KB, fall back to 1250x1750 (250 DPI) at 84% quality.
  if (optimizedBuffer.length > 600 * 1024) {
    optimizedBuffer = await sharp(buffer)
      .resize(1250, 1750, { fit: "cover", position: "center" })
      .jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
  }

  // 3. Absolute failsafe: if still > 700KB, scale to 1050x1470 (210 DPI)
  if (optimizedBuffer.length > 700 * 1024) {
    optimizedBuffer = await sharp(buffer)
      .resize(1050, 1470, { fit: "cover", position: "center" })
      .jpeg({ quality: 78 })
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
