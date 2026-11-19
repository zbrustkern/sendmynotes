/** Build the checked-in isolated worker after edits:
 * node_modules/.bin/esbuild lib/wedding/artwork-worker-source.ts --bundle --platform=node --target=node20 --format=cjs --external:sharp --external:opentype.js --outfile=lib/wedding/artwork-worker.cjs
 * No Firebase imports, credentials, network adapters or project mutation tools enter this bundle.
 */
import {readFile, writeFile} from 'node:fs/promises';
import sharp, {type OverlayOptions} from 'sharp';
import {normalizeUploadImage} from '../upload/media';
import {layoutTreatment, renderLetteringSvg} from '../upload/treatments';
import {ARTWORK_LIMITS, artworkComposition, assertStillArtwork, WeddingArtworkError} from './artwork-policy';
sharp.cache(false);
sharp.concurrency(1);
let finishing=false;
process.on('disconnect',()=>{if(!finishing)process.exit(1);});
const reportMemory=()=>{if(process.connected)process.send?.({rss:process.memoryUsage.rss()});};
reportMemory();setInterval(reportMemory,25).unref();
// A parent crash must not leave a decoder running without its deadline.
setTimeout(() => process.exit(1), ARTWORK_LIMITS.processMs).unref();
async function main() {
  let config = '';
  for await (const chunk of process.stdin) { config += chunk; if (config.length > 8192) throw new Error('Invalid worker request'); }
  const job = JSON.parse(config) as {input: string; source: string; output: string; mime: string; composition: unknown; normalized?: boolean};
  const raw = await readFile(job.input);
  assertStillArtwork(raw, job.mime);
  // A previously checked panorama can have a short side below 512 after the
  // shared normalizer scales its long side to 3072. Preserve that source for
  // editing instead of applying the original-upload minimum a second time.
  const known = job.normalized ? await sharp(raw,{failOn:'error',limitInputPixels:3072*3072}).metadata() : null;
  if(known && (known.format!=='png'||!known.width||!known.height||known.width>3072||known.height>3072||(known.pages||1)!==1))throw new WeddingArtworkError('invalid_image','The normalized source is invalid.');
  const normalized = known ? {bytes:raw,width:known.width!,height:known.height!,warning:undefined as string|undefined} : await normalizeUploadImage(raw, job.mime);
  // Keep reusable normalized sources within the existing intake byte ceiling.
  if (normalized.bytes.length > ARTWORK_LIMITS.inputBytes) {
    normalized.bytes = await sharp(normalized.bytes).resize({width:2048,height:2048,fit:'inside'}).png().toBuffer();
    const metadata = await sharp(normalized.bytes).metadata();
    normalized.width = metadata.width!; normalized.height = metadata.height!;
  }
  const crop = artworkComposition(job.composition);
  const w = ARTWORK_LIMITS.width, h = ARTWORK_LIMITS.height;
  const scale = (crop.fit === 'cover' ? Math.max(w / normalized.width, h / normalized.height) : Math.min(w / normalized.width, h / normalized.height)) * crop.zoom;
  const rw = Math.round(normalized.width * scale), rh = Math.round(normalized.height * scale);
  // Resize extreme panoramas without allocating the entire scaled panorama: libvips
  // extracts the needed region lazily. Reject extreme intermediate dimensions anyway.
  if (rw * rh > ARTWORK_LIMITS.pixels || rw > 32768 || rh > 32768) throw new WeddingArtworkError('crop_too_large', 'Use Fit or a smaller zoom for this image.', 413);
  const ox = Math.round((w - rw) * (1 + crop.x) / 2), oy = Math.round((h - rh) * (1 + crop.y) / 2);
  const visible = await sharp(normalized.bytes, {limitInputPixels: ARTWORK_LIMITS.pixels}).resize(rw,rh)
    .extract({left: Math.max(0,-ox), top: Math.max(0,-oy), width: Math.min(w,rw), height: Math.min(h,rh)}).png().toBuffer();
  const overlays: OverlayOptions[] = [{input: visible, left: Math.max(0,ox), top: Math.max(0,oy)}];
  if (crop.lettering.text) overlays.push({input: Buffer.from(renderLetteringSvg(layoutTreatment(crop.lettering.text,crop.lettering.treatment))), left: 0, top: 0});
  const master = await sharp({create: {width:w, height:h, channels:3, background:'#f4f1eb'}}).composite(overlays).removeAlpha().png().toBuffer();
  if (normalized.bytes.length > ARTWORK_LIMITS.outputBytes || master.length > ARTWORK_LIMITS.outputBytes) throw new WeddingArtworkError('output_too_large', 'Choose a smaller image.', 413);
  await writeFile(job.source, normalized.bytes, {mode: 0o600});
  await writeFile(job.output, master, {mode: 0o600});
  process.stdout.write(JSON.stringify({width: w,height: h,sourceWidth: normalized.width,sourceHeight: normalized.height,warning: normalized.warning}));
}
main().catch(error => {
  const allowed = typeof error?.code === 'string' && typeof error?.status === 'number';
  process.stdout.write(JSON.stringify({error: allowed ? error.message : 'This image could not be processed. Try another file.', code: allowed ? error.code : 'invalid_image', status: allowed ? error.status : 400}));
  process.exitCode = 1;
}).finally(()=>{finishing=true;if(process.connected)process.disconnect?.();});
