import sharp, { Metadata } from 'sharp';
import { UploadError, UPLOAD_LIMITS } from './contracts';

export type NormalizedUpload = { bytes: Buffer; width: number; height: number; warning?: string };

/** Decode and normalize one still raster image, dropping all source metadata. */
export async function normalizeUploadImage(raw: Buffer, contentType: string): Promise<NormalizedUpload> {
  if (raw.length <= 0 || raw.length > UPLOAD_LIMITS.bytes) throw new UploadError('file_too_large','Image must be 15 MB or smaller.',413);
  if (!['image/jpeg','image/png','image/webp'].includes(contentType)) throw new UploadError('unsupported_type','Choose a JPEG, PNG, or WebP image.',415);
  let input: ReturnType<typeof sharp>; let metadata: Metadata;
  try {
    input=sharp(raw,{failOn:'error',limitInputPixels:UPLOAD_LIMITS.pixels,animated:false});
    metadata=await input.metadata();
  } catch { throw new UploadError('invalid_image','This image could not be decoded. Choose another file.',400); }
  const matchingFormat: Record<string,string>={'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'};
  if (!metadata.width || !metadata.height || metadata.format!==matchingFormat[contentType] || (metadata.pages||1)>1) throw new UploadError('invalid_image','Choose a still JPEG, PNG, or WebP image.',400);
  if (metadata.width*metadata.height>UPLOAD_LIMITS.pixels) throw new UploadError('image_too_large','Image dimensions exceed the 40 megapixel limit.',413);
  if (Math.min(metadata.width,metadata.height)<UPLOAD_LIMITS.minEdge) throw new UploadError('image_too_small','Image must be at least 512 pixels on its shortest side.',400);
  try {
    // EXIF orientation is applied; transparency is flattened to a warm neutral.
    // Re-encoding as PNG removes EXIF, GPS, ICC and other source metadata.
    const bytes=await input.rotate().resize({width:3072,height:3072,fit:'inside',withoutEnlargement:true}).toColourspace('srgb').flatten({background:'#f4f1eb'}).png().toBuffer();
    const normalized=await sharp(bytes).metadata();
    const width=normalized.width||metadata.width,height=normalized.height||metadata.height;
    return {bytes,width,height,...(Math.min(width,height)<1000?{warning:'The image may lose detail in the finished artwork.'}:{})};
  } catch { throw new UploadError('invalid_image','This image could not be normalized. Choose another file.',400); }
}
