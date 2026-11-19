/** Server-owned Sprint 0031 raster policy. Never accept storage keys or URLs from clients. */
export const ARTWORK_POLICY = 'wedding-raster-v1';
export const ARTWORK_LIMITS = {
  inputBytes: 15 * 1024 * 1024, requestBytes: 15 * 1024 * 1024 + 16 * 1024,
  outputBytes: 40 * 1024 * 1024, pixels: 40_000_000, width: 1275, height: 1650,
  receiveMs: 20_000, processMs: 15_000, workerMemoryBytes: 384 * 1024 * 1024,
  sourceCount: 20, revisionCount: 128, projectBytes: 256 * 1024 * 1024,
  dailyAttempts: 100, minuteAttempts: 10, projectConcurrency: 1, globalConcurrency: 2,
  leaseMs: 120_000, pendingDays: 7,
} as const;
export class WeddingArtworkError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = 'WeddingArtworkError'; }
}
export type ArtworkComposition = {fit: 'cover'|'contain'; zoom: number; x: number; y: number; lettering: {text: string; treatment: 'classic-serif'|'gentle-arch'|'playful-stack'}};
export function artworkComposition(value: unknown): ArtworkComposition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WeddingArtworkError('invalid_composition', 'Choose crop and lettering settings.');
  const v = value as Record<string, unknown>;
  if (v.fit !== undefined && v.fit !== 'cover' && v.fit !== 'contain') throw new WeddingArtworkError('invalid_fit', 'Choose crop or fit.');
  const number = (name: string, fallback: number, min: number, max: number) => {
    const n = v[name] ?? fallback;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new WeddingArtworkError('invalid_crop', 'Crop settings are outside the supported range.');
    return n;
  };
  let text = '', treatment: ArtworkComposition['lettering']['treatment'] = 'classic-serif';
  if (typeof v.lettering === 'string') text = v.lettering;
  else if (v.lettering !== undefined && v.lettering !== null) {
    if (typeof v.lettering !== 'object' || Array.isArray(v.lettering)) throw new WeddingArtworkError('invalid_lettering', 'Enter the words for the front.');
    const l = v.lettering as Record<string, unknown>;
    if (typeof l.text !== 'string' || (l.treatment !== undefined && !['classic-serif','gentle-arch','playful-stack'].includes(l.treatment as string))) throw new WeddingArtworkError('invalid_lettering', 'Choose a supported lettering style.');
    text = l.text; treatment = (l.treatment as typeof treatment) || treatment;
  }
  if (text.length > 200 || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) throw new WeddingArtworkError('invalid_lettering', 'Use plain words on at most three lines.');
  if (Array.from(new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(text)).length > 40 || text.split('\n').length > 3) throw new WeddingArtworkError('text_too_long', 'Use up to 40 characters on at most three lines.');
  return {fit: v.fit === 'contain' ? 'contain' : 'cover', zoom: number('zoom', 1, 1, 3), x: number('x', 0, -1, 1), y: number('y', 0, -1, 1), lettering: {text, treatment}};
}
export function artworkId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new WeddingArtworkError('not_found', 'Card front not found.', 404);
}
export function rasterMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  throw new WeddingArtworkError('unsupported_type', 'Choose a still JPEG, PNG or WebP image.', 415);
}
/** libvips may expose only the first APNG frame; reject animation from the PNG
 * chunk structure as well as the decoder's page count. Never scan pixel payloads. */
export function assertStillArtwork(bytes: Buffer, mime: string): void {
  if(rasterMime(bytes)!==mime)throw new WeddingArtworkError('unsupported_type','The file does not match its image type.',415);
  if(mime!=='image/png')return;
  let offset=8,chunks=0;
  while(offset+12<=bytes.length) {
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
    if(++chunks>10000||length>bytes.length-offset-12)throw new WeddingArtworkError('invalid_image','This PNG is malformed. Choose another file.');
    if(type==='acTL'||type==='fcTL'||type==='fdAT')throw new WeddingArtworkError('invalid_image','Choose a still image, without animation.');
    offset+=length+12;
    if(type==='IEND')return;
  }
  throw new WeddingArtworkError('invalid_image','This PNG is incomplete. Choose another file.');
}
/** For already authorized, hash-verified private masters only. This does not
 * decode, resize, strip metadata, or accept a new user upload. */
export function assertNormalizedWeddingFront(bytes:Buffer):void {
  if(!bytes.length||bytes.length>ARTWORK_LIMITS.inputBytes)throw new WeddingArtworkError('normalized_front_required','Choose an approved normalized card front.',409);
  assertStillArtwork(bytes,'image/png');
  if(bytes.length<33||bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)!==ARTWORK_LIMITS.width||bytes.readUInt32BE(20)!==ARTWORK_LIMITS.height||bytes[24]!==8||![2,6].includes(bytes[25])||bytes[26]!==0||bytes[27]!==0||bytes[28]!==0)throw new WeddingArtworkError('normalized_front_required','Choose an approved A2 PNG front.',409);
  let offset=8,hasPixels=false;
  const permitted=new Set(['IHDR','IDAT','IEND','pHYs','sRGB','gAMA','cHRM']);
  while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
    if(!permitted.has(type))throw new WeddingArtworkError('normalized_front_required','This front needs authenticated re-selection before transfer.',409);
    if(type==='IDAT')hasPixels=true;
    offset+=length+12;
    if(type==='IEND'){if(!hasPixels||length!==0||offset!==bytes.length)throw new WeddingArtworkError('normalized_front_required','Choose an approved normalized card front.',409);return;}
  }
}
export const WEDDING_ARTWORK_PRESETS = Object.freeze({
  'preset-thankyou-botanical': '/presets/thank-you-botanical.jpg',
  'preset-thankyou-laurel': '/presets/thank-you-laurel-wreath.jpg',
  'preset-love-roses': '/presets/love-roses.jpg',
});
export function weddingArtworkPreset(id: string): string | null {
  return Object.prototype.hasOwnProperty.call(WEDDING_ARTWORK_PRESETS, id) ? WEDDING_ARTWORK_PRESETS[id as keyof typeof WEDDING_ARTWORK_PRESETS] : null;
}
