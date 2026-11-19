"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// lib/wedding/artwork-worker-source.ts
var import_promises = require("node:fs/promises");
var import_sharp2 = __toESM(require("sharp"));

// lib/upload/media.ts
var import_sharp = __toESM(require("sharp"));

// lib/upload/contracts.ts
var UploadError = class extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "UploadError";
  }
};
var UPLOAD_LIMITS = { bytes: 15 * 1024 * 1024, pixels: 4e7, minEdge: 512, promptChars: 1e3, textGraphemes: 40, daily: 20, width: 1275, height: 1650 };

// lib/upload/media.ts
async function normalizeUploadImage(raw, contentType) {
  if (raw.length <= 0 || raw.length > UPLOAD_LIMITS.bytes) throw new UploadError("file_too_large", "Image must be 15 MB or smaller.", 413);
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) throw new UploadError("unsupported_type", "Choose a JPEG, PNG, or WebP image.", 415);
  let input;
  let metadata;
  try {
    input = (0, import_sharp.default)(raw, { failOn: "error", limitInputPixels: UPLOAD_LIMITS.pixels, animated: false });
    metadata = await input.metadata();
  } catch {
    throw new UploadError("invalid_image", "This image could not be decoded. Choose another file.", 400);
  }
  const matchingFormat = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
  if (!metadata.width || !metadata.height || metadata.format !== matchingFormat[contentType] || (metadata.pages || 1) > 1) throw new UploadError("invalid_image", "Choose a still JPEG, PNG, or WebP image.", 400);
  if (metadata.width * metadata.height > UPLOAD_LIMITS.pixels) throw new UploadError("image_too_large", "Image dimensions exceed the 40 megapixel limit.", 413);
  if (Math.min(metadata.width, metadata.height) < UPLOAD_LIMITS.minEdge) throw new UploadError("image_too_small", "Image must be at least 512 pixels on its shortest side.", 400);
  try {
    const bytes = await input.rotate().resize({ width: 3072, height: 3072, fit: "inside", withoutEnlargement: true }).toColourspace("srgb").flatten({ background: "#f4f1eb" }).png().toBuffer();
    const normalized = await (0, import_sharp.default)(bytes).metadata();
    const width = normalized.width || metadata.width, height = normalized.height || metadata.height;
    return { bytes, width, height, ...Math.min(width, height) < 1e3 ? { warning: "The image may lose detail in the finished artwork." } : {} };
  } catch {
    throw new UploadError("invalid_image", "This image could not be normalized. Choose another file.", 400);
  }
}

// lib/upload/treatments.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var opentype = __toESM(require("opentype.js"));
function readFont(filename) {
  const data = (0, import_node_fs.readFileSync)((0, import_node_path.join)(process.cwd(), "lib/upload", filename));
  const exactBytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return opentype.parse(exactBytes);
}
var fonts = { playful: readFont("fredoka.woff"), serif: readFont("dm-serif-display.woff") };
function splitExact(text) {
  if (typeof text !== "string") throw new UploadError("invalid_text", "Enter the words you want on the front.");
  if (text.length === 0) return [];
  const normalized = text;
  const lines = normalized.split("\n");
  const count = Array.from(new Intl.Segmenter(void 0, { granularity: "grapheme" }).segment(normalized)).length;
  if (count > UPLOAD_LIMITS.textGraphemes || lines.length > 3 || normalized.length > 0 && lines.some((line) => !line.trim())) throw new UploadError("text_too_long", "Use up to 40 characters on no more than three lines.");
  return lines;
}
function getTreatmentFont(treatmentId) {
  return treatmentId === "classic-serif" ? fonts.serif : fonts.playful;
}
function assertGlyphSupport(text, treatmentId) {
  const font = getTreatmentFont(treatmentId);
  for (const char of Array.from(text)) {
    if (char === "\n" || char === "\r") continue;
    const glyph = font.charToGlyph(char);
    if (!glyph || glyph.index === 0) throw new UploadError("unsupported_glyph", "These words include characters this lettering style cannot render. Try different wording.");
  }
}
function wrapBalanced(text, face, maxLines = 3) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [text];
  if (words.length === 2) return words;
  const lineCount = Math.min(maxLines, words.length);
  let best;
  const visit = (start, lines) => {
    if (lines.length === lineCount - 1) {
      const tail = words.slice(start).join(" ");
      if (!tail) return;
      const candidate = [...lines, tail];
      const widths = candidate.map((line) => face.getAdvanceWidth(line, 1, { kerning: true }));
      const max = Math.max(...widths);
      const avg = widths.reduce((a, b) => a + b, 0) / widths.length;
      const score = max + widths.reduce((sum, width) => sum + (width - avg) ** 2, 0) / (avg || 1) * 0.05;
      if (!best || score < best.score) best = { score, lines: candidate };
      return;
    }
    const remainingLines = lineCount - lines.length - 1;
    for (let end = start + 1; end <= words.length - remainingLines; end++) visit(end, [...lines, words.slice(start, end).join(" ")]);
  };
  visit(0, []);
  return best?.lines || [text];
}
function layoutTreatment(exactText, treatmentId) {
  let lines = splitExact(exactText);
  const region = { x: 112, y: 50, width: 1051, height: 390 };
  if (!lines.length) return { lines: [], color: "#243b35", font: "bundled", align: "center", region, decoration: "none" };
  assertGlyphSupport(exactText, treatmentId);
  const face = getTreatmentFont(treatmentId);
  const font = `bundled-${treatmentId === "classic-serif" ? "dm-serif-display" : "fredoka"}`;
  if (treatmentId === "playful-stack" && lines.length === 1 && lines[0].trim().includes(" ")) lines = wrapBalanced(lines[0], face, 3);
  let size = treatmentId === "classic-serif" ? 164 : treatmentId === "gentle-arch" ? 156 : 176;
  const maxAdvance = Math.max(...lines.map((line) => face.getAdvanceWidth(line, 1, { kerning: true })));
  const lineGapFactor = treatmentId === "playful-stack" ? 1.05 : 1.12;
  size = Math.min(size, Math.floor(980 / Math.max(0.01, maxAdvance)), Math.floor(region.height / (lines.length * lineGapFactor)));
  if (size < 38) throw new UploadError("text_does_not_fit", "These words are too long for this treatment. Shorten the words or add line breaks.");
  const lineGap = Math.round(size * lineGapFactor);
  const blockHeight = lines.length * lineGap;
  if (blockHeight > region.height) throw new UploadError("text_does_not_fit", "These words do not fit in the lettering area. Use fewer lines.");
  const baseline = region.y + (region.height - blockHeight) / 2 + size * 0.82;
  const layouts = lines.map((line, i) => ({ text: line, x: 637.5, y: baseline + i * lineGap, size, rotate: treatmentId === "playful-stack" ? i % 2 === 0 ? -2 : 2 : 0 }));
  return { lines: layouts, color: treatmentId === "classic-serif" ? "#243b35" : treatmentId === "gentle-arch" ? "#9b4939" : "#e06b43", font, align: "center", region, decoration: treatmentId === "playful-stack" ? "shadow" : treatmentId === "gentle-arch" ? "arch" : "none" };
}
function renderLetteringSvg(layout) {
  const nodes = layout.lines.map((line, i) => {
    const face = getTreatmentFont(layout.font.includes("serif") ? "classic-serif" : "playful-stack");
    const width = face.getAdvanceWidth(line.text, line.size, { kerning: true });
    const textPath = face.getPath(line.text, line.x - width / 2, line.y, line.size, { kerning: true }).toPathData(2);
    const paths = `<path d="${textPath}"/>`;
    const shadow = layout.decoration === "shadow" ? `<g transform="translate(5 7)" fill="#f8e4c6">${paths}</g>` : "";
    if (layout.decoration === "arch" && i === 0) {
      const chars = Array.from(line.text);
      const scale = line.size / face.unitsPerEm;
      const glyphs = chars.map((char) => face.charToGlyph(char));
      const kern = chars.map((_, index) => index ? face.getKerningValue(glyphs[index - 1], glyphs[index]) * scale : 0);
      const adv = glyphs.map((glyph, index) => (glyph.advanceWidth || 0) * scale + kern[index]);
      const total = adv.reduce((a, b) => a + b, 0);
      let x = line.x - total / 2;
      const arch = chars.map((_, index) => {
        x += kern[index];
        const glyph = glyphs[index];
        const gx = x + (glyph.advanceWidth || 0) * scale / 2;
        const t = (gx - line.x) / (total / 2 || 1);
        const y = line.y - 85 * Math.max(0, 1 - t * t);
        const path = glyph.getPath(x, y, line.size).toPathData(2);
        x += (glyph.advanceWidth || 0) * scale;
        return `<path d="${path}"/>`;
      }).join("");
      return `<g fill="${layout.color}">${arch}</g>`;
    }
    return `${shadow}<g fill="${layout.color}"${line.rotate ? ` transform="rotate(${line.rotate} ${line.x} ${line.y - line.size / 2})"` : ""}>${paths}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1275" height="1650" viewBox="0 0 1275 1650">${nodes}</svg>`;
}

// lib/wedding/artwork-policy.ts
var ARTWORK_LIMITS = {
  inputBytes: 15 * 1024 * 1024,
  requestBytes: 15 * 1024 * 1024 + 16 * 1024,
  outputBytes: 40 * 1024 * 1024,
  pixels: 4e7,
  width: 1275,
  height: 1650,
  receiveMs: 2e4,
  processMs: 15e3,
  workerMemoryBytes: 384 * 1024 * 1024,
  sourceCount: 20,
  revisionCount: 128,
  projectBytes: 256 * 1024 * 1024,
  dailyAttempts: 100,
  minuteAttempts: 10,
  projectConcurrency: 1,
  globalConcurrency: 2,
  leaseMs: 12e4,
  pendingDays: 7
};
var WeddingArtworkError = class extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "WeddingArtworkError";
  }
};
function artworkComposition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WeddingArtworkError("invalid_composition", "Choose crop and lettering settings.");
  const v = value;
  if (v.fit !== void 0 && v.fit !== "cover" && v.fit !== "contain") throw new WeddingArtworkError("invalid_fit", "Choose crop or fit.");
  const number = (name, fallback, min, max) => {
    const n = v[name] ?? fallback;
    if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new WeddingArtworkError("invalid_crop", "Crop settings are outside the supported range.");
    return n;
  };
  let text = "", treatment = "classic-serif";
  if (typeof v.lettering === "string") text = v.lettering;
  else if (v.lettering !== void 0 && v.lettering !== null) {
    if (typeof v.lettering !== "object" || Array.isArray(v.lettering)) throw new WeddingArtworkError("invalid_lettering", "Enter the words for the front.");
    const l = v.lettering;
    if (typeof l.text !== "string" || l.treatment !== void 0 && !["classic-serif", "gentle-arch", "playful-stack"].includes(l.treatment)) throw new WeddingArtworkError("invalid_lettering", "Choose a supported lettering style.");
    text = l.text;
    treatment = l.treatment || treatment;
  }
  if (text.length > 200 || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) throw new WeddingArtworkError("invalid_lettering", "Use plain words on at most three lines.");
  if (Array.from(new Intl.Segmenter(void 0, { granularity: "grapheme" }).segment(text)).length > 40 || text.split("\n").length > 3) throw new WeddingArtworkError("text_too_long", "Use up to 40 characters on at most three lines.");
  return { fit: v.fit === "contain" ? "contain" : "cover", zoom: number("zoom", 1, 1, 3), x: number("x", 0, -1, 1), y: number("y", 0, -1, 1), lettering: { text, treatment } };
}
function rasterMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw new WeddingArtworkError("unsupported_type", "Choose a still JPEG, PNG or WebP image.", 415);
}
function assertStillArtwork(bytes, mime) {
  if (rasterMime(bytes) !== mime) throw new WeddingArtworkError("unsupported_type", "The file does not match its image type.", 415);
  if (mime !== "image/png") return;
  let offset = 8, chunks = 0;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
    if (++chunks > 1e4 || length > bytes.length - offset - 12) throw new WeddingArtworkError("invalid_image", "This PNG is malformed. Choose another file.");
    if (type === "acTL" || type === "fcTL" || type === "fdAT") throw new WeddingArtworkError("invalid_image", "Choose a still image, without animation.");
    offset += length + 12;
    if (type === "IEND") return;
  }
  throw new WeddingArtworkError("invalid_image", "This PNG is incomplete. Choose another file.");
}
var WEDDING_ARTWORK_PRESETS = Object.freeze({
  "preset-thankyou-botanical": "/presets/thank-you-botanical.jpg",
  "preset-thankyou-laurel": "/presets/thank-you-laurel-wreath.jpg",
  "preset-love-roses": "/presets/love-roses.jpg"
});

// lib/wedding/artwork-worker-source.ts
import_sharp2.default.cache(false);
import_sharp2.default.concurrency(1);
var finishing = false;
process.on("disconnect", () => {
  if (!finishing) process.exit(1);
});
var reportMemory = () => {
  if (process.connected) process.send?.({ rss: process.memoryUsage.rss() });
};
reportMemory();
setInterval(reportMemory, 25).unref();
setTimeout(() => process.exit(1), ARTWORK_LIMITS.processMs).unref();
async function main() {
  let config = "";
  for await (const chunk of process.stdin) {
    config += chunk;
    if (config.length > 8192) throw new Error("Invalid worker request");
  }
  const job = JSON.parse(config);
  const raw = await (0, import_promises.readFile)(job.input);
  assertStillArtwork(raw, job.mime);
  const known = job.normalized ? await (0, import_sharp2.default)(raw, { failOn: "error", limitInputPixels: 3072 * 3072 }).metadata() : null;
  if (known && (known.format !== "png" || !known.width || !known.height || known.width > 3072 || known.height > 3072 || (known.pages || 1) !== 1)) throw new WeddingArtworkError("invalid_image", "The normalized source is invalid.");
  const normalized = known ? { bytes: raw, width: known.width, height: known.height, warning: void 0 } : await normalizeUploadImage(raw, job.mime);
  if (normalized.bytes.length > ARTWORK_LIMITS.inputBytes) {
    normalized.bytes = await (0, import_sharp2.default)(normalized.bytes).resize({ width: 2048, height: 2048, fit: "inside" }).png().toBuffer();
    const metadata = await (0, import_sharp2.default)(normalized.bytes).metadata();
    normalized.width = metadata.width;
    normalized.height = metadata.height;
  }
  const crop = artworkComposition(job.composition);
  const w = ARTWORK_LIMITS.width, h = ARTWORK_LIMITS.height;
  const scale = (crop.fit === "cover" ? Math.max(w / normalized.width, h / normalized.height) : Math.min(w / normalized.width, h / normalized.height)) * crop.zoom;
  const rw = Math.round(normalized.width * scale), rh = Math.round(normalized.height * scale);
  if (rw * rh > ARTWORK_LIMITS.pixels || rw > 32768 || rh > 32768) throw new WeddingArtworkError("crop_too_large", "Use Fit or a smaller zoom for this image.", 413);
  const ox = Math.round((w - rw) * (1 + crop.x) / 2), oy = Math.round((h - rh) * (1 + crop.y) / 2);
  const visible = await (0, import_sharp2.default)(normalized.bytes, { limitInputPixels: ARTWORK_LIMITS.pixels }).resize(rw, rh).extract({ left: Math.max(0, -ox), top: Math.max(0, -oy), width: Math.min(w, rw), height: Math.min(h, rh) }).png().toBuffer();
  const overlays = [{ input: visible, left: Math.max(0, ox), top: Math.max(0, oy) }];
  if (crop.lettering.text) overlays.push({ input: Buffer.from(renderLetteringSvg(layoutTreatment(crop.lettering.text, crop.lettering.treatment))), left: 0, top: 0 });
  const master = await (0, import_sharp2.default)({ create: { width: w, height: h, channels: 3, background: "#f4f1eb" } }).composite(overlays).removeAlpha().png().toBuffer();
  if (normalized.bytes.length > ARTWORK_LIMITS.outputBytes || master.length > ARTWORK_LIMITS.outputBytes) throw new WeddingArtworkError("output_too_large", "Choose a smaller image.", 413);
  await (0, import_promises.writeFile)(job.source, normalized.bytes, { mode: 384 });
  await (0, import_promises.writeFile)(job.output, master, { mode: 384 });
  process.stdout.write(JSON.stringify({ width: w, height: h, sourceWidth: normalized.width, sourceHeight: normalized.height, warning: normalized.warning }));
}
main().catch((error) => {
  const allowed = typeof error?.code === "string" && typeof error?.status === "number";
  process.stdout.write(JSON.stringify({ error: allowed ? error.message : "This image could not be processed. Try another file.", code: allowed ? error.code : "invalid_image", status: allowed ? error.status : 400 }));
  process.exitCode = 1;
}).finally(() => {
  finishing = true;
  if (process.connected) process.disconnect?.();
});
